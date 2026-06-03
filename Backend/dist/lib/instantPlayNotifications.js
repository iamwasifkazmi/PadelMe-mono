import { MatchType } from "@prisma/client";
import { emailsEqual } from "./emailsCi.js";
import { haversineKm } from "./geo.js";
import { notifyUser, userDisplayNameForEmail } from "./matchNotifications.js";
import { prisma } from "./prisma.js";
async function canonicalEmail(raw) {
    const u = await prisma.user.findFirst({
        where: { email: { equals: raw.trim(), mode: "insensitive" } },
        select: { email: true, notifyInstantPlay: true, notifyNearbyMatches: true },
    });
    return u?.email?.trim() ?? raw.trim();
}
async function userNotifyPrefs(email) {
    const u = await prisma.user.findFirst({
        where: { email: { equals: email.trim(), mode: "insensitive" } },
        select: { email: true, notifyInstantPlay: true, notifyNearbyMatches: true },
    });
    return {
        email: u?.email?.trim() ?? email.trim(),
        notifyInstantPlay: u?.notifyInstantPlay !== false,
        notifyNearbyMatches: u?.notifyNearbyMatches !== false,
    };
}
/** In-app + push when an instant match is ready (queue filled or joined open lobby). */
export async function notifyInstantPlayMatched(opts) {
    const seen = new Set();
    const place = (opts.locationName || "").trim() || "nearby";
    await Promise.all(opts.recipientEmails.map(async (raw) => {
        const prefs = await userNotifyPrefs(raw);
        if (!prefs.notifyInstantPlay)
            return;
        if (opts.excludeEmail && emailsEqual(prefs.email, opts.excludeEmail))
            return;
        const key = prefs.email.toLowerCase();
        if (seen.has(key))
            return;
        seen.add(key);
        await notifyUser({
            userEmail: prefs.email,
            type: "instant_play_matched",
            title: "⚡ Instant match ready",
            body: `You've been matched for "${opts.matchTitle}" at ${place}. Open the game to confirm your spot.`,
            matchId: opts.matchId,
            relatedEntityType: "match",
            relatedEntityId: opts.matchId,
            priority: "high",
        });
    }));
}
/** Someone joined an open instant lobby — tell existing players. */
export async function notifyInstantPlayPlayerJoined(opts) {
    const joinerName = await userDisplayNameForEmail(opts.joinerEmail);
    const seen = new Set();
    await Promise.all(opts.rosterEmails.map(async (raw) => {
        const prefs = await userNotifyPrefs(raw);
        if (!prefs.notifyInstantPlay)
            return;
        if (emailsEqual(prefs.email, opts.joinerEmail))
            return;
        const key = prefs.email.toLowerCase();
        if (seen.has(key))
            return;
        seen.add(key);
        await notifyUser({
            userEmail: prefs.email,
            type: "instant_play_player_joined",
            title: "Player joined instant game",
            body: `${joinerName} joined "${opts.matchTitle}".`,
            matchId: opts.matchId,
            priority: "high",
        });
    }));
}
/** While waiting in queue, ping nearby players who opted in to nearby alerts. */
export async function notifyNearbyInstantPlaySeekers(opts) {
    const seekerCanon = await canonicalEmail(opts.seekerEmail);
    const seekerLabel = (opts.seekerName || "").trim() || (await userDisplayNameForEmail(seekerCanon));
    const place = (opts.locationName || "").trim() || "nearby";
    const formatLabel = opts.matchType === MatchType.singles
        ? "singles"
        : opts.matchType === MatchType.mixed_doubles
            ? "mixed doubles"
            : "doubles";
    const skip = new Set((opts.alreadyNotified || []).map((e) => e.trim().toLowerCase()).filter(Boolean));
    skip.add(seekerCanon.toLowerCase());
    const candidates = await prisma.user.findMany({
        where: {
            locationLat: { not: null },
            locationLng: { not: null },
            notifyNearbyMatches: { not: false },
        },
        select: { email: true, locationLat: true, locationLng: true, notifyNearbyMatches: true },
        take: 200,
    });
    const notified = [];
    for (const u of candidates) {
        const email = u.email.trim();
        const key = email.toLowerCase();
        if (skip.has(key))
            continue;
        if (u.locationLat == null || u.locationLng == null)
            continue;
        const dist = haversineKm(opts.locationLat, opts.locationLng, u.locationLat, u.locationLng);
        const cap = opts.maxDistanceKm;
        if (dist > cap)
            continue;
        skip.add(key);
        notified.push(email);
        if (notified.length >= 20)
            break;
        await notifyUser({
            userEmail: email,
            type: "instant_play_nearby",
            title: "⚡ Player nearby wants padel",
            body: `${seekerLabel} is looking for ${formatLabel} near ${place}. Open Instant Play to join.`,
            matchId: null,
            relatedEntityType: "instant_play",
            relatedEntityId: null,
            priority: "high",
        });
    }
    return notified;
}
