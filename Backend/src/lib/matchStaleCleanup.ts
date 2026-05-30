import { MatchStatus } from "@prisma/client";
import { prisma } from "./prisma.js";
import { dedupeEmailsCi } from "./emailsCi.js";
import {
  fullRosterStartWindowExpired,
  matchPlayWindowHasEnded,
  scheduledNonInstantSlotIsExpired,
} from "./matchSchedule.js";
import { notifyMatchEmails } from "./matchNotifications.js";

/**
 * Cancels scheduled (non-instant) **open** matches whose slot start is in the past.
 * Full rosters are not auto-cancelled so the group can still start the match.
 * Idempotent-safe: only updates `open` rows.
 */
export async function cancelStalePastScheduledMatches(nowMs = Date.now()): Promise<{
  cancelled: number;
  matchIds: string[];
}> {
  const candidates = await prisma.match.findMany({
    where: {
      status: MatchStatus.open,
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

/**
 * Cancels scheduled (non-instant) **full** matches that were never started:
 * if still `full` more than 24 hours after the scheduled start time, cancel and notify players.
 * "Started" = organiser moved the match past `full` (e.g. in_progress); until then roster stays full.
 * Idempotent-safe: only updates `full` rows.
 */
export async function cancelFullScheduledMatchesNeverStarted(nowMs = Date.now()): Promise<{
  cancelled: number;
  matchIds: string[];
}> {
  const candidates = await prisma.match.findMany({
    where: {
      status: MatchStatus.full,
      isInstant: false,
    },
    select: {
      id: true,
      title: true,
      date: true,
      timeLabel: true,
      players: true,
    },
    orderBy: { date: "asc" },
    take: 5000,
  });

  const matchIds: string[] = [];

  for (const m of candidates) {
    if (
      !fullRosterStartWindowExpired({
        date: m.date,
        timeLabel: m.timeLabel ?? "",
        isInstant: false,
      }, nowMs)
    ) {
      continue;
    }

    await prisma.match.update({
      where: { id: m.id },
      data: {
        status: MatchStatus.cancelled,
        cancelledBy: "system:full-roster-no-start-24h",
        cancelledAt: new Date(nowMs),
      },
    });

    matchIds.push(m.id);
    const roster = dedupeEmailsCi(m.players);
    await notifyMatchEmails(roster, {
      type: "match_cancelled",
      title: "Match cancelled",
      body: `"${m.title.trim()}" was cancelled automatically—the roster was full but no one started the match within 24 hours after the scheduled time.`,
      matchId: m.id,
    });
  }

  if (matchIds.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[stale-match-cleanup] cancelled ${matchIds.length} full-roster match(es) (24h past start, never started)`);
  }

  return { cancelled: matchIds.length, matchIds };
}

/**
 * Cancels instant **open** / **full** matches after their play window (start + duration) has ended.
 */
export async function cancelStaleInstantMatches(nowMs = Date.now()): Promise<{
  cancelled: number;
  matchIds: string[];
}> {
  const candidates = await prisma.match.findMany({
    where: {
      isInstant: true,
      status: { in: [MatchStatus.open, MatchStatus.full] },
    },
    select: {
      id: true,
      title: true,
      date: true,
      timeLabel: true,
      durationMinutes: true,
      players: true,
    },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });

  const matchIds: string[] = [];

  for (const m of candidates) {
    const slot = {
      date: m.date,
      timeLabel: m.timeLabel ?? "",
      durationMinutes: m.durationMinutes,
    };
    if (!matchPlayWindowHasEnded(slot, nowMs)) continue;

    await prisma.match.update({
      where: { id: m.id },
      data: {
        status: MatchStatus.cancelled,
        cancelledBy: "system:instant-window-ended",
        cancelledAt: new Date(nowMs),
      },
    });

    matchIds.push(m.id);
    const roster = dedupeEmailsCi(m.players);
    await notifyMatchEmails(roster, {
      type: "match_cancelled",
      title: "Match cancelled",
      body: `"${m.title.trim()}" was cancelled automatically—the instant play window has ended.`,
      matchId: m.id,
    });
  }

  if (matchIds.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[stale-match-cleanup] cancelled ${matchIds.length} instant match(es)`);
  }

  return { cancelled: matchIds.length, matchIds };
}

/** Runs all stale match cleanups (open past slot, full no-start, instant window). */
export async function runAllStaleMatchCleanups(nowMs = Date.now()) {
  const openPast = await cancelStalePastScheduledMatches(nowMs);
  const fullNoStart = await cancelFullScheduledMatchesNeverStarted(nowMs);
  const instantPast = await cancelStaleInstantMatches(nowMs);
  return {
    cancelledOpenPastSlot: openPast.cancelled,
    matchIdsOpenPastSlot: openPast.matchIds,
    cancelledFullNoStart24h: fullNoStart.cancelled,
    matchIdsFullNoStart24h: fullNoStart.matchIds,
    cancelledInstantWindow: instantPast.cancelled,
    matchIdsInstantWindow: instantPast.matchIds,
    cancelled: openPast.cancelled + fullNoStart.cancelled + instantPast.cancelled,
    matchIds: [...openPast.matchIds, ...fullNoStart.matchIds, ...instantPast.matchIds],
  };
}
