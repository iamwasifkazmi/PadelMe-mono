import { MatchStatus } from "@prisma/client";
import { prisma } from "./prisma.js";
import { dedupeEmailsCi } from "./emailsCi.js";
import { matchScheduledStartUtcMs, scheduledNonInstantSlotIsExpired } from "./matchSchedule.js";
import { notifyMatchEmails } from "./matchNotifications.js";
const MS_24H = 24 * 60 * 60 * 1000;
/**
 * Cancels scheduled (non-instant) **open** matches whose slot start is in the past.
 * Full rosters are not auto-cancelled so the group can still start the match.
 * Idempotent-safe: only updates `open` rows.
 */
export async function cancelStalePastScheduledMatches(nowMs = Date.now()) {
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
    const matchIds = [];
    for (const m of candidates) {
        const slot = {
            date: m.date,
            timeLabel: m.timeLabel ?? "",
            isInstant: m.isInstant,
        };
        if (!scheduledNonInstantSlotIsExpired(slot, nowMs))
            continue;
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
export async function cancelFullScheduledMatchesNeverStarted(nowMs = Date.now()) {
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
    const matchIds = [];
    for (const m of candidates) {
        const start = matchScheduledStartUtcMs({ date: m.date, timeLabel: m.timeLabel ?? "" });
        if (Number.isNaN(start))
            continue;
        if (start + MS_24H >= nowMs)
            continue;
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
/** Runs both stale open-slot cleanup and full-roster no-start cleanup. */
export async function runAllStaleMatchCleanups(nowMs = Date.now()) {
    const openPast = await cancelStalePastScheduledMatches(nowMs);
    const fullNoStart = await cancelFullScheduledMatchesNeverStarted(nowMs);
    return {
        cancelledOpenPastSlot: openPast.cancelled,
        matchIdsOpenPastSlot: openPast.matchIds,
        cancelledFullNoStart24h: fullNoStart.cancelled,
        matchIdsFullNoStart24h: fullNoStart.matchIds,
        cancelled: openPast.cancelled + fullNoStart.cancelled,
        matchIds: [...openPast.matchIds, ...fullNoStart.matchIds],
    };
}
