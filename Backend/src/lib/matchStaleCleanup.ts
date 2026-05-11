import { MatchStatus } from "@prisma/client";
import { prisma } from "./prisma.js";
import { dedupeEmailsCi } from "./emailsCi.js";
import { scheduledNonInstantSlotIsExpired } from "./matchSchedule.js";
import { notifyMatchEmails } from "./matchNotifications.js";

/**
 * Cancels scheduled (non-instant) matches still in recruiting state whose slot start is in the past.
 * Idempotent-safe: only updates open/full rows.
 */
export async function cancelStalePastScheduledMatches(nowMs = Date.now()): Promise<{
  cancelled: number;
  matchIds: string[];
}> {
  const candidates = await prisma.match.findMany({
    where: {
      status: { in: [MatchStatus.open, MatchStatus.full] },
      isInstant: false,
    },
    select: {
      id: true,
      title: true,
      date: true,
      timeLabel: true,
      isInstant: true,
      players: true,
    },
    orderBy: { date: "asc" },
    take: 5000,
  });

  const matchIds: string[] = [];

  for (const m of candidates) {
    const slot = {
      date: m.date,
      timeLabel: m.timeLabel ?? "",
      isInstant: m.isInstant,
    };
    if (!scheduledNonInstantSlotIsExpired(slot, nowMs)) continue;

    await prisma.match.update({
      where: { id: m.id },
      data: {
        status: MatchStatus.cancelled,
        cancelledBy: "system:auto-past-slot",
        cancelledAt: new Date(nowMs),
      },
    });

    matchIds.push(m.id);
    const roster = dedupeEmailsCi(m.players);
    await notifyMatchEmails(roster, {
      type: "match_cancelled",
      title: "Match cancelled",
      body: `"${m.title.trim()}" was cancelled automatically—the scheduled date and time have passed.`,
      matchId: m.id,
    });
  }

  if (matchIds.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[stale-match-cleanup] cancelled ${matchIds.length} past-slot match(es)`);
  }

  return { cancelled: matchIds.length, matchIds };
}
