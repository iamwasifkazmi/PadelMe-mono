import { Router } from "express";
import { MatchStatus, MatchType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { applyEloAfterCompletedMatch } from "../../lib/applyEloAfterCompletedMatch.js";
import { balancePadelTeams, inferWinnerTeam, isDoublesStyle, teamsPartitionPlayers, effectiveTeamsAtStart, } from "../../lib/matchTeams.js";
import { validateMatchStart } from "../../lib/matchStartValidator.js";
import { playerMeetsMatchEligibility, userToEligibilityProfile, stubProfileForEmail, } from "../../lib/matchEligibility.js";
import { resolveEffectiveElo } from "../../lib/elo.js";
import { emitMatchMessage, emitMatchReceipt } from "../../lib/socket.js";
import { notifyHostPlayerJoinedMatch, notifyMatchEmails, notifyUser, } from "../../lib/matchNotifications.js";
import { dedupeEmailsCi, emailsEqual, playersIncludesCi } from "../../lib/emailsCi.js";
import { matchIsDiscoverableJoinable } from "../../lib/matchListing.js";
import { syncMatchConversationInbox } from "../../lib/matchConversationInbox.js";
import { scheduledStartUtcMs, scheduledNonInstantJoinAllowed, matchAppearsOnDiscoveryListBySchedule, } from "../../lib/matchSchedule.js";
export const matchesRouter = Router();
async function getHostEmail(match) {
    if (!match.hostId)
        return null;
    const u = await prisma.user.findUnique({
        where: { id: match.hostId },
        select: { email: true },
    });
    return u?.email ?? null;
}
/** Attach latest profile name + photo for group chat UI (not stored on ChatMessage rows). */
async function enrichMatchChatMessages(rows) {
    if (rows.length === 0)
        return [];
    const emails = dedupeEmailsCi(rows.map((m) => m.senderEmail));
    const users = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { email: true, photoUrl: true, fullName: true },
    });
    const byEmail = new Map(users.map((u) => [u.email.trim().toLowerCase(), u]));
    return rows.map((m) => {
        const u = byEmail.get(m.senderEmail.trim().toLowerCase());
        const displayName = (u?.fullName && u.fullName.trim()) || m.senderName;
        return {
            ...m,
            senderName: displayName,
            senderPhotoUrl: u?.photoUrl ?? null,
        };
    });
}
function excerptReplyText(raw, max = 260) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (t.length <= max)
        return t;
    return `${t.slice(0, max - 1)}…`;
}
/** Base44-style: organiser, or doubles team captains (fallback: first on team), or the other player in singles. */
async function actorCanValidatePendingScore(match, actor, submitter) {
    if (!actor?.trim() || !submitter?.trim())
        return false;
    if (emailsEqual(actor, submitter))
        return false;
    if (!playersIncludesCi(match.players, actor))
        return false;
    const hostEmail = await getHostEmail(match);
    if (hostEmail && emailsEqual(actor, hostEmail))
        return true;
    if (isDoublesStyle(match)) {
        const capA = (match.teamACaptainEmail || match.teamA[0] || "").trim();
        const capB = (match.teamBCaptainEmail || match.teamB[0] || "").trim();
        if (capA && emailsEqual(actor, capA))
            return true;
        if (capB && emailsEqual(actor, capB))
            return true;
        return false;
    }
    return true;
}
function singlesWinnerEmailFromMatch(match, winnerTeam) {
    if (isDoublesStyle(match))
        return null;
    const { teamA, teamB } = effectiveTeamsAtStart(match);
    if (winnerTeam === "team_a")
        return teamA[0] ?? match.players[0] ?? null;
    return teamB[0] ?? match.players[1] ?? null;
}
function matchStartDateTime(match) {
    const dt = new Date(match.date);
    const parts = match.timeLabel.split(":");
    const h = Number.parseInt(parts[0] || "0", 10);
    const m = Number.parseInt(parts[1] || "0", 10);
    dt.setHours(h, m, 0, 0);
    return dt;
}
async function rosterProfileMap(playerEmails) {
    if (!playerEmails.length)
        return new Map();
    const users = await prisma.user.findMany({
        where: {
            OR: playerEmails.map((e) => ({
                email: { equals: e, mode: "insensitive" },
            })),
        },
    });
    const map = new Map();
    for (const u of users) {
        map.set(u.email.trim().toLowerCase(), userToEligibilityProfile(u));
    }
    return map;
}
async function withHostJson(match) {
    const hostEmail = await getHostEmail(match);
    return { ...match, hostEmail };
}
matchesRouter.get("/", async (req, res) => {
    const status = req.query.status;
    const skill = String(req.query.skill || "").trim().toLowerCase();
    const where = {
        ...(status
            ? { status }
            : {
                NOT: { status: MatchStatus.cancelled },
            }),
        ...(skill ? { skillLevel: skill } : {}),
    };
    const matches = await prisma.match.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
    });
    let list = matches.map((m) => ({
        ...m,
        players: dedupeEmailsCi(m.players),
        teamA: dedupeEmailsCi(m.teamA),
        teamB: dedupeEmailsCi(m.teamB),
        confirmedPlayerEmails: dedupeEmailsCi(m.confirmedPlayerEmails),
    }));
    list = list.filter((m) => matchAppearsOnDiscoveryListBySchedule({
        date: m.date instanceof Date ? m.date : new Date(m.date),
        timeLabel: m.timeLabel,
        isInstant: m.isInstant,
        status: m.status,
    }));
    if (status === MatchStatus.open) {
        list = list.filter((m) => matchIsDiscoverableJoinable({
            players: m.players,
            confirmedPlayerEmails: m.confirmedPlayerEmails,
            maxPlayers: m.maxPlayers,
        }));
    }
    res.json(list);
});
matchesRouter.post("/", async (req, res) => {
    const body = req.body;
    if (!body.title || !body.timeLabel || !body.locationName) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    const lat = body.locationLat;
    const lng = body.locationLng;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "locationLat and locationLng are required (exact venue coordinates)" });
    }
    const isInstant = body.isInstant === true;
    if (!isInstant) {
        const dateStr = String(body.date || "").trim();
        if (!dateStr)
            return res.status(400).json({ error: "date is required for scheduled matches" });
        const startMs = scheduledStartUtcMs(dateStr, body.timeLabel);
        if (Number.isNaN(startMs) || startMs < Date.now() - 60_000) {
            return res.status(400).json({ error: "Match must be scheduled in the future" });
        }
    }
    const parsedDate = body.date ? new Date(body.date) : new Date();
    const host = body.createdByEmail
        ? await prisma.user.findUnique({ where: { email: body.createdByEmail } })
        : null;
    const maxPlayers = body.maxPlayers || 4;
    const players = body.createdByEmail ? [body.createdByEmail] : [];
    const initialStatus = players.length >= maxPlayers ? MatchStatus.full : MatchStatus.open;
    const scoringRaw = body.scoringMode != null ? String(body.scoringMode).toLowerCase().trim() : "simple";
    const scoringModeParsed = scoringRaw === "sets" ? "sets" : "simple";
    let numSets = typeof body.numSets === "number" && Number.isFinite(body.numSets)
        ? Math.trunc(body.numSets)
        : scoringModeParsed === "sets"
            ? 3
            : 1;
    if (![1, 3, 5].includes(numSets))
        numSets = scoringModeParsed === "sets" ? 3 : 1;
    if (scoringModeParsed === "simple")
        numSets = 1;
    const gamesPerSet = typeof body.gamesPerSet === "number" && Number.isFinite(body.gamesPerSet)
        ? Math.min(21, Math.max(1, Math.trunc(body.gamesPerSet)))
        : 6;
    const tiebreakIn = body.tiebreakRule != null ? String(body.tiebreakRule).trim() : "";
    const tiebreakRule = tiebreakIn.slice(0, 48) || "tiebreak_at_6";
    const matchTypeForBalance = body.matchType || MatchType.doubles;
    const autoBalanceTeams = body.autoBalanceTeams === true && matchTypeForBalance !== MatchType.singles;
    const countryRaw = body.country != null ? String(body.country).trim() : "";
    const created = await prisma.match.create({
        data: {
            title: body.title,
            date: parsedDate,
            timeLabel: body.timeLabel,
            locationName: body.locationName,
            locationAddress: body.locationAddress || undefined,
            locationLat: lat,
            locationLng: lng,
            country: countryRaw || undefined,
            durationMinutes: body.durationMinutes || undefined,
            notes: body.notes || undefined,
            visibility: body.visibility || "public",
            tags: Array.isArray(body.tags) ? body.tags : [],
            invitedEmails: Array.isArray(body.invitedEmails) ? body.invitedEmails : [],
            skillLevel: body.skillLevel || undefined,
            isInstant,
            maxPlayers,
            matchType: body.matchType || MatchType.doubles,
            players,
            confirmedPlayerEmails: body.createdByEmail ? [body.createdByEmail] : [],
            teamA: Array.isArray(body.teamA) ? body.teamA : [],
            teamB: Array.isArray(body.teamB) ? body.teamB : [],
            status: initialStatus,
            hostId: host?.id,
            genderRequirement: body.genderRequirement ?? "any",
            ageMin: typeof body.ageMin === "number" ? body.ageMin : undefined,
            ageMax: typeof body.ageMax === "number" ? body.ageMax : undefined,
            skillRangeMin: typeof body.skillRangeMin === "number" ? body.skillRangeMin : undefined,
            skillRangeMax: typeof body.skillRangeMax === "number" ? body.skillRangeMax : undefined,
            minRatingThreshold: typeof body.minRatingThreshold === "number" ? body.minRatingThreshold : undefined,
            verificationRequirement: body.verificationRequirement ?? "none",
            scoringMode: scoringModeParsed,
            numSets,
            gamesPerSet,
            tiebreakRule,
            autoBalanceTeams,
        },
    });
    return res.status(201).json(await withHostJson(created));
});
matchesRouter.get("/:id/recent-form", async (req, res) => {
    const email = String(req.query.email || "").trim();
    if (!email)
        return res.status(400).json({ error: "email query is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    const row = await prisma.playerRecentForm.findFirst({
        where: {
            matchId: match.id,
            userEmail: { equals: email, mode: "insensitive" },
        },
    });
    res.json(row);
});
matchesRouter.get("/:id", async (req, res) => {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    const hostEmail = await getHostEmail(match);
    return res.json({
        ...match,
        players: dedupeEmailsCi(match.players),
        teamA: dedupeEmailsCi(match.teamA),
        teamB: dedupeEmailsCi(match.teamB),
        confirmedPlayerEmails: dedupeEmailsCi(match.confirmedPlayerEmails),
        hostEmail,
    });
});
matchesRouter.post("/:id/join", async (req, res) => {
    const email = String(req.body.email || "").trim();
    const team = req.body.team;
    if (!email)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    const joiner = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
    });
    const canonicalEmail = (joiner?.email ?? email).trim();
    if (match.status === MatchStatus.cancelled) {
        return res.status(409).json({ error: "Match was cancelled" });
    }
    if (match.visibility === "invite_only") {
        const hostEmail = await getHostEmail(match);
        const allowed = (hostEmail && emailsEqual(hostEmail, canonicalEmail)) ||
            match.invitedEmails.some((e) => emailsEqual(e, canonicalEmail)) ||
            playersIncludesCi(match.players, canonicalEmail);
        if (!allowed) {
            return res.status(403).json({ error: "This match is invite-only" });
        }
    }
    if (playersIncludesCi(match.players, canonicalEmail)) {
        const players = dedupeEmailsCi(match.players);
        const teamA = dedupeEmailsCi(match.teamA);
        const teamB = dedupeEmailsCi(match.teamB);
        const dirty = players.length !== match.players.length ||
            teamA.length !== match.teamA.length ||
            teamB.length !== match.teamB.length;
        if (dirty) {
            const cleaned = await prisma.match.update({
                where: { id: req.params.id },
                data: { players, teamA, teamB },
            });
            return res.json(await withHostJson(cleaned));
        }
        return res.json(await withHostJson(match));
    }
    if (!scheduledNonInstantJoinAllowed({
        date: match.date instanceof Date ? match.date : new Date(match.date),
        timeLabel: match.timeLabel,
        isInstant: match.isInstant,
    })) {
        return res.status(410).json({
            error: "This match's scheduled time has passed; you cannot join anymore",
        });
    }
    if (match.visibility !== "invite_only") {
        if (!matchIsDiscoverableJoinable({
            players: match.players,
            confirmedPlayerEmails: match.confirmedPlayerEmails,
            maxPlayers: match.maxPlayers,
        })) {
            return res.status(409).json({ error: "This match is not accepting new players" });
        }
    }
    if (dedupeEmailsCi(match.players).length >= match.maxPlayers) {
        return res.status(409).json({ error: "Match is full" });
    }
    const prof = joiner ? userToEligibilityProfile(joiner) : stubProfileForEmail(canonicalEmail);
    const elig = playerMeetsMatchEligibility(match, prof);
    if (!elig.ok) {
        return res.status(403).json({ error: elig.reason });
    }
    let teamA = dedupeEmailsCi([...match.teamA]);
    let teamB = dedupeEmailsCi([...match.teamB]);
    if (isDoublesStyle(match) && !match.teamsLocked && match.maxPlayers >= 4) {
        if (team !== "a" && team !== "b") {
            return res.status(400).json({ error: "Choose team A or B for this doubles match" });
        }
        if (team === "a")
            teamA = dedupeEmailsCi([...teamA, canonicalEmail]);
        else
            teamB = dedupeEmailsCi([...teamB, canonicalEmail]);
    }
    const players = dedupeEmailsCi([...match.players, canonicalEmail]);
    const confirmedPlayerEmails = dedupeEmailsCi([
        ...match.confirmedPlayerEmails,
        canonicalEmail,
    ]);
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: {
            players,
            teamA,
            teamB,
            confirmedPlayerEmails,
            status: players.length >= match.maxPlayers ? MatchStatus.full : MatchStatus.open,
        },
    });
    const hostEmail = await getHostEmail(match);
    if (hostEmail) {
        await notifyHostPlayerJoinedMatch({
            hostEmail,
            joinerEmail: canonicalEmail,
            matchId: match.id,
            matchTitle: match.title,
        });
    }
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/leave", async (req, res) => {
    const email = String(req.body.email || "").trim();
    if (!email)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status === MatchStatus.cancelled) {
        return res.status(409).json({ error: "Match was cancelled" });
    }
    if (!playersIncludesCi(match.players, email)) {
        return res.json(await withHostJson(match));
    }
    const startDt = matchStartDateTime(match);
    const diffMs = startDt.getTime() - Date.now();
    const lateWithdrawal = diffMs > 0 && diffMs < 2 * 60 * 60 * 1000;
    if (lateWithdrawal) {
        const stats = await prisma.playerStats.findFirst({
            where: { userEmail: { equals: email, mode: "insensitive" } },
        });
        if (stats) {
            await prisma.playerStats.update({
                where: { id: stats.id },
                data: { reliabilityScore: Math.max(0, stats.reliabilityScore - 5) },
            });
        }
    }
    const players = match.players.filter((p) => !emailsEqual(p, email));
    const confirmedPlayerEmails = match.confirmedPlayerEmails.filter((e) => !emailsEqual(e, email));
    let teamsLocked = match.teamsLocked;
    if (match.teamA.some((p) => emailsEqual(p, email)) || match.teamB.some((p) => emailsEqual(p, email))) {
        teamsLocked = false;
    }
    const wasFull = match.status === MatchStatus.full;
    const hostEmailLeave = await getHostEmail(match);
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: {
            players,
            confirmedPlayerEmails,
            teamA: match.teamA.filter((p) => !emailsEqual(p, email)),
            teamB: match.teamB.filter((p) => !emailsEqual(p, email)),
            teamsLocked,
            replacementNeeded: true,
            status: players.length >= match.maxPlayers ? MatchStatus.full : MatchStatus.open,
        },
    });
    if (hostEmailLeave && !emailsEqual(email, hostEmailLeave)) {
        await notifyUser({
            userEmail: hostEmailLeave,
            type: "match_player_left",
            title: "Player has withdrawn",
            body: `${email} left "${match.title}". A slot may be open.`,
            matchId: match.id,
        });
    }
    if (wasFull && hostEmailLeave) {
        const recipients = match.players.filter((p) => !emailsEqual(p, email) && !emailsEqual(p, hostEmailLeave));
        await notifyMatchEmails(recipients, {
            type: "match_player_left",
            title: "A player has left",
            body: `${email} left "${match.title}". The organiser may be finding a replacement.`,
            matchId: match.id,
        });
    }
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/confirm", async (req, res) => {
    const email = String(req.body.email || "").trim();
    if (!email)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status === MatchStatus.cancelled) {
        return res.status(409).json({ error: "Match was cancelled" });
    }
    if (!playersIncludesCi(match.players, email)) {
        return res.status(400).json({ error: "Only listed players can confirm attendance" });
    }
    if (match.confirmedPlayerEmails.some((e) => emailsEqual(e, email))) {
        return res.json(await withHostJson(match));
    }
    const confirmedPlayerEmails = dedupeEmailsCi([...match.confirmedPlayerEmails, email]);
    const playersDeduped = dedupeEmailsCi(match.players);
    const nextStatus = playersDeduped.length >= match.maxPlayers ? MatchStatus.full : match.status;
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: { confirmedPlayerEmails, status: nextStatus },
    });
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/teams", async (req, res) => {
    const actor = String(req.body.email || "");
    const { teamA, teamB } = req.body;
    if (!actor)
        return res.status(400).json({ error: "email is required" });
    if (!Array.isArray(teamA) || !Array.isArray(teamB)) {
        return res.status(400).json({ error: "teamA and teamB arrays are required" });
    }
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status === MatchStatus.cancelled) {
        return res.status(409).json({ error: "Match was cancelled" });
    }
    const hostEmail = await getHostEmail(match);
    if (!hostEmail || !emailsEqual(actor, hostEmail)) {
        return res.status(403).json({ error: "Only the organiser can set teams" });
    }
    if (match.teamsLocked) {
        return res.status(409).json({ error: "Teams are locked; unlock first to change lineups" });
    }
    if (!teamsPartitionPlayers(teamA, teamB, match.players)) {
        return res.status(400).json({ error: "Teams must partition match players exactly once" });
    }
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: { teamA, teamB },
    });
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/balance-teams", async (req, res) => {
    const actor = String(req.body.email || "");
    if (!actor)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status === MatchStatus.cancelled) {
        return res.status(409).json({ error: "Match was cancelled" });
    }
    const hostEmail = await getHostEmail(match);
    if (!hostEmail || !emailsEqual(actor, hostEmail)) {
        return res.status(403).json({ error: "Only the organiser can auto-balance teams" });
    }
    if (match.teamsLocked) {
        return res.status(409).json({ error: "Teams are locked; unlock first" });
    }
    if (match.players.length < 2) {
        return res.status(400).json({ error: "Need at least two players to form teams" });
    }
    const users = await prisma.user.findMany({
        where: { email: { in: match.players } },
        include: { playerStats: true },
    });
    const eloByEmail = {};
    for (const u of users) {
        const stored = u.playerStats?.eloRating ?? u.eloRating ?? 1000;
        const lastAt = u.playerStats?.lastMatchAt ?? null;
        eloByEmail[u.email] = resolveEffectiveElo(stored, lastAt);
    }
    const { teamA, teamB } = balancePadelTeams(match.players, eloByEmail);
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: { teamA, teamB },
    });
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/lock-teams", async (req, res) => {
    const actor = String(req.body.email || "");
    if (!actor)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status === MatchStatus.cancelled) {
        return res.status(409).json({ error: "Match was cancelled" });
    }
    const hostEmail = await getHostEmail(match);
    if (!hostEmail || !emailsEqual(actor, hostEmail)) {
        return res.status(403).json({ error: "Only the organiser can lock teams" });
    }
    if (!teamsPartitionPlayers(match.teamA, match.teamB, match.players)) {
        return res.status(400).json({ error: "Set valid teams that include every player once" });
    }
    if (isDoublesStyle(match) && match.players.length >= 4) {
        if (match.teamA.length !== 2 || match.teamB.length !== 2) {
            return res.status(400).json({ error: "Doubles requires exactly two players per team" });
        }
    }
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: { teamsLocked: true },
    });
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/unlock-teams", async (req, res) => {
    const actor = String(req.body.email || "");
    if (!actor)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status === MatchStatus.cancelled) {
        return res.status(409).json({ error: "Match was cancelled" });
    }
    if (match.status !== MatchStatus.open && match.status !== MatchStatus.full) {
        return res.status(409).json({ error: "Teams can only be unlocked before the match starts" });
    }
    const hostEmail = await getHostEmail(match);
    if (!hostEmail || !emailsEqual(actor, hostEmail)) {
        return res.status(403).json({ error: "Only the organiser can unlock teams" });
    }
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: { teamsLocked: false },
    });
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/cancel", async (req, res) => {
    const actor = String(req.body.email || "").trim();
    if (!actor)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status !== MatchStatus.open && match.status !== MatchStatus.full) {
        return res.status(409).json({ error: "Match cannot be cancelled now" });
    }
    const hostEmail = await getHostEmail(match);
    if (!hostEmail || !emailsEqual(actor, hostEmail)) {
        return res.status(403).json({ error: "Only the organiser can cancel this match" });
    }
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: {
            status: MatchStatus.cancelled,
            cancelledBy: actor,
            cancelledAt: new Date(),
        },
    });
    const others = match.players.filter((p) => !emailsEqual(p, actor));
    await notifyMatchEmails(others, {
        type: "match_cancelled",
        title: "Match cancelled",
        body: `"${match.title}" has been cancelled.`,
        matchId: match.id,
    });
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/start", async (req, res) => {
    const actor = String(req.body.email || "").trim();
    if (!actor)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status !== MatchStatus.open && match.status !== MatchStatus.full) {
        return res.status(409).json({ error: "Match cannot be started from current status" });
    }
    const hostEmail = await getHostEmail(match);
    if (!hostEmail || !emailsEqual(actor, hostEmail)) {
        return res.status(403).json({ error: "Only the organiser can start the match" });
    }
    const rosterProfiles = await rosterProfileMap(match.players);
    const startCheck = validateMatchStart(match, rosterProfiles);
    if (!startCheck.valid) {
        return res.status(400).json({ error: startCheck.reason });
    }
    const { teamA, teamB } = effectiveTeamsAtStart(match);
    let teamACaptainEmail = match.teamACaptainEmail;
    let teamBCaptainEmail = match.teamBCaptainEmail;
    if (isDoublesStyle(match) && match.players.length >= 4) {
        if (!teamACaptainEmail)
            teamACaptainEmail = teamA[0] ?? null;
        if (!teamBCaptainEmail)
            teamBCaptainEmail = teamB[0] ?? null;
    }
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: {
            status: MatchStatus.in_progress,
            teamA,
            teamB,
            teamACaptainEmail,
            teamBCaptainEmail,
        },
    });
    return res.json(await withHostJson(updated));
});
/** Organiser marks the on-court portion done; score entry still open (Base44-style `awaiting_score`). */
matchesRouter.post("/:id/awaiting-score", async (req, res) => {
    const actor = String(req.body.email || "").trim();
    if (!actor)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status !== MatchStatus.in_progress) {
        return res.status(409).json({ error: "Only an in-progress match can move to awaiting score" });
    }
    const hostEmail = await getHostEmail(match);
    if (!hostEmail || !emailsEqual(actor, hostEmail)) {
        return res.status(403).json({ error: "Only the organiser can mark awaiting score" });
    }
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: { status: MatchStatus.awaiting_score },
    });
    const recipients = match.players.filter((p) => !emailsEqual(p, actor));
    if (recipients.length > 0) {
        await notifyMatchEmails(recipients, {
            type: "match_awaiting_score",
            title: "Match played — submit score",
            body: `"${match.title}" is awaiting a score. Submit from the match screen when you've agreed the result.`,
            matchId: match.id,
        });
    }
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/submit-score", async (req, res) => {
    const { scoreTeamA, scoreTeamB, winnerTeam, submittedBy, email, evidenceUrl: evidenceUrlRaw, } = req.body;
    const actor = String(submittedBy || email || "").trim();
    const evidenceTrim = String(evidenceUrlRaw || "").trim();
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status === MatchStatus.cancelled) {
        return res.status(409).json({ error: "Match was cancelled" });
    }
    if (match.status === MatchStatus.completed) {
        return res.json(match);
    }
    if (match.status === MatchStatus.disputed) {
        return res.status(409).json({
            error: "Match is disputed. The organiser must reopen it before entering scores.",
        });
    }
    if (!scoreTeamA?.trim() || !scoreTeamB?.trim()) {
        return res.status(400).json({ error: "scoreTeamA and scoreTeamB are required" });
    }
    // Base44 MatchScoreModal: same submitter may edit while status is still pending_validation.
    if (match.status === MatchStatus.pending_validation) {
        if (!actor) {
            return res.status(400).json({ error: "submittedBy or email is required to update a pending score" });
        }
        const pendingSubmitter = match.scoreSubmittedBy;
        if (!pendingSubmitter?.trim() || !emailsEqual(actor, pendingSubmitter)) {
            return res.status(409).json({
                error: "Only the player who proposed the score can change it while it is pending validation",
            });
        }
        if (!match.players.some((p) => emailsEqual(p, actor))) {
            return res.status(403).json({ error: "Only participants can submit a score" });
        }
        const inferredEdit = inferWinnerTeam(scoreTeamA, scoreTeamB);
        const resolvedWinnerEdit = (String(winnerTeam || "").trim() || inferredEdit || "").trim() || null;
        const winnerNormEdit = resolvedWinnerEdit
            ? resolvedWinnerEdit.toLowerCase().replace(/[\s-]+/g, "_")
            : null;
        const wTeamEdit = winnerNormEdit === "team_a" || winnerNormEdit === "teama"
            ? "team_a"
            : winnerNormEdit === "team_b" || winnerNormEdit === "teamb"
                ? "team_b"
                : null;
        const pendingWEdit = wTeamEdit || inferredEdit;
        if (!pendingWEdit) {
            return res.status(400).json({ error: "Could not infer winner; add winnerTeam" });
        }
        const updatedEdit = await prisma.match.update({
            where: { id: req.params.id },
            data: {
                pendingScoreTeamA: scoreTeamA,
                pendingScoreTeamB: scoreTeamB,
                pendingWinnerTeam: pendingWEdit,
                evidenceUrl: evidenceTrim || null,
            },
        });
        return res.json(await withHostJson(updatedEdit));
    }
    const scoreable = match.status === MatchStatus.in_progress || match.status === MatchStatus.awaiting_score;
    if (!scoreable) {
        return res.status(409).json({ error: "Match is not accepting scores in its current state" });
    }
    const hostEmail = await getHostEmail(match);
    const inferred = inferWinnerTeam(scoreTeamA, scoreTeamB);
    const resolvedWinner = (winnerTeam || inferred || "").trim() || null;
    const winnerNorm = resolvedWinner
        ? resolvedWinner.toLowerCase().replace(/[\s-]+/g, "_")
        : null;
    const wTeam = winnerNorm === "team_a" || winnerNorm === "teama"
        ? "team_a"
        : winnerNorm === "team_b" || winnerNorm === "teamb"
            ? "team_b"
            : null;
    const finalize = async () => {
        if (!wTeam) {
            return res.status(400).json({ error: "winnerTeam could not be determined; set it explicitly" });
        }
        const winnerEmailSingle = singlesWinnerEmailFromMatch(match, wTeam);
        const updated = await prisma.match.update({
            where: { id: req.params.id },
            data: {
                scoreTeamA,
                scoreTeamB,
                winnerTeam: wTeam,
                winnerEmail: winnerEmailSingle,
                status: MatchStatus.completed,
                scoreConfirmedBy: actor && actor.trim() ? actor : null,
                pendingScoreTeamA: null,
                pendingScoreTeamB: null,
                pendingWinnerTeam: null,
                scoreSubmittedBy: null,
                ...(evidenceTrim ? { evidenceUrl: evidenceTrim } : {}),
            },
        });
        try {
            await applyEloAfterCompletedMatch(updated);
        }
        catch (err) {
            console.error("[elo] applyEloAfterCompletedMatch failed:", err);
        }
        return res.json(await withHostJson(updated));
    };
    // Legacy clients (no actor): complete immediately (no peer step).
    if (!actor) {
        return await finalize();
    }
    // Base44-style: if anyone else is on the match roster, proposed scores go to pending_validation
    // for a captain / organiser / peer to confirm — including when the submitter is the organiser.
    const others = match.players.filter((p) => !emailsEqual(p, actor));
    if (others.length === 0) {
        return await finalize();
    }
    const participant = match.players.some((p) => emailsEqual(p, actor));
    if (!participant) {
        return res.status(403).json({ error: "Only participants can submit a score" });
    }
    const pendingW = wTeam || inferred;
    if (!pendingW) {
        return res.status(400).json({ error: "Could not infer winner; add winnerTeam" });
    }
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: {
            pendingScoreTeamA: scoreTeamA,
            pendingScoreTeamB: scoreTeamB,
            pendingWinnerTeam: pendingW,
            scoreSubmittedBy: actor,
            status: MatchStatus.pending_validation,
            evidenceUrl: evidenceTrim || null,
        },
    });
    const hostN = await getHostEmail(match);
    const toAlert = new Set();
    if (hostN && !emailsEqual(hostN, actor))
        toAlert.add(hostN);
    for (const p of match.players) {
        if (!emailsEqual(p, actor))
            toAlert.add(p.trim());
    }
    await notifyMatchEmails([...toAlert], {
        type: "match_score_pending",
        title: "Score proposed",
        body: `${actor} submitted a result for "${match.title}". A team captain or organiser should confirm or reject in the match.`,
        matchId: match.id,
    });
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/confirm-score", async (req, res) => {
    const actor = String(req.body.email || "");
    if (!actor)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status !== MatchStatus.awaiting_score &&
        match.status !== MatchStatus.pending_validation) {
        return res.status(409).json({ error: "No pending score to confirm" });
    }
    const submitter = match.scoreSubmittedBy;
    if (!submitter?.trim()) {
        return res.status(400).json({ error: "No score submitter recorded" });
    }
    if (emailsEqual(actor, submitter)) {
        return res.status(403).json({ error: "You cannot confirm your own score submission" });
    }
    const allowed = await actorCanValidatePendingScore(match, actor, submitter);
    if (!allowed) {
        return res.status(403).json({
            error: "Only the organiser or a team captain can confirm this result (doubles), or the other player (singles).",
        });
    }
    const wRaw = match.pendingWinnerTeam ||
        inferWinnerTeam(match.pendingScoreTeamA || "", match.pendingScoreTeamB || "");
    if (wRaw !== "team_a" && wRaw !== "team_b") {
        return res.status(400).json({ error: "Invalid pending scores" });
    }
    const w = wRaw;
    const winnerEmailSingle = singlesWinnerEmailFromMatch(match, w);
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: {
            scoreTeamA: match.pendingScoreTeamA,
            scoreTeamB: match.pendingScoreTeamB,
            winnerTeam: w,
            winnerEmail: winnerEmailSingle,
            status: MatchStatus.completed,
            scoreConfirmedBy: actor,
            pendingScoreTeamA: null,
            pendingScoreTeamB: null,
            pendingWinnerTeam: null,
            scoreSubmittedBy: null,
        },
    });
    try {
        await applyEloAfterCompletedMatch(updated);
    }
    catch (err) {
        console.error("[elo] applyEloAfterCompletedMatch failed:", err);
    }
    const recipients = match.players.filter((p) => !emailsEqual(p, actor));
    await notifyMatchEmails(recipients, {
        type: "match_completed",
        title: "Match result confirmed",
        body: `"${match.title}" is complete. Rate your opponents when you can.`,
        matchId: match.id,
    });
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/reject-score", async (req, res) => {
    const actor = String(req.body.email || "");
    if (!actor)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status !== MatchStatus.awaiting_score &&
        match.status !== MatchStatus.pending_validation) {
        return res.status(409).json({ error: "No pending score to reject" });
    }
    const submitter = match.scoreSubmittedBy;
    if (!submitter?.trim()) {
        return res.status(400).json({ error: "No score submitter recorded" });
    }
    if (emailsEqual(actor, submitter)) {
        return res.status(403).json({ error: "You cannot reject your own submission" });
    }
    const allowed = await actorCanValidatePendingScore(match, actor, submitter);
    if (!allowed) {
        return res.status(403).json({
            error: "Only the organiser or a team captain can reject this proposal (doubles), or the other player (singles).",
        });
    }
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: {
            pendingScoreTeamA: null,
            pendingScoreTeamB: null,
            pendingWinnerTeam: null,
            scoreSubmittedBy: null,
            status: MatchStatus.in_progress,
            evidenceUrl: null,
        },
    });
    await notifyUser({
        userEmail: submitter.trim(),
        type: "match_score_rejected",
        title: "Score not accepted",
        body: `Your proposed score for "${match.title}" was rejected. Submit again after agreement.`,
        matchId: match.id,
    });
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/dispute-score", async (req, res) => {
    const actor = String(req.body.email || "").trim();
    const reason = String(req.body.reason || "").trim();
    if (!actor)
        return res.status(400).json({ error: "email is required" });
    if (!reason)
        return res.status(400).json({ error: "reason is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status !== MatchStatus.awaiting_score &&
        match.status !== MatchStatus.pending_validation) {
        return res.status(409).json({ error: "No pending score to dispute" });
    }
    const submitter = match.scoreSubmittedBy;
    if (!submitter?.trim()) {
        return res.status(400).json({ error: "No score submitter recorded" });
    }
    if (emailsEqual(actor, submitter)) {
        return res.status(403).json({ error: "You cannot dispute your own submission" });
    }
    const allowed = await actorCanValidatePendingScore(match, actor, submitter);
    if (!allowed) {
        return res.status(403).json({
            error: "Only the organiser or a team captain can dispute this proposal (doubles), or the other player (singles).",
        });
    }
    const reasonPreview = reason.length > 160 ? `${reason.slice(0, 157)}...` : reason;
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: {
            pendingScoreTeamA: null,
            pendingScoreTeamB: null,
            pendingWinnerTeam: null,
            scoreSubmittedBy: null,
            evidenceUrl: null,
            status: MatchStatus.disputed,
            scoreDisputeReason: reason,
            disputedBy: actor,
            disputedAt: new Date(),
        },
    });
    await notifyUser({
        userEmail: submitter.trim(),
        type: "match_score_disputed",
        title: "Score disputed",
        body: `Your proposed score for "${match.title}" was disputed (${reasonPreview}). The organiser must reopen the match before a new result can be entered.`,
        matchId: match.id,
    });
    const hostEmailDispute = await getHostEmail(match);
    const toAlert = new Set();
    for (const p of match.players) {
        const pe = p.trim();
        if (!emailsEqual(pe, actor) && !emailsEqual(pe, submitter))
            toAlert.add(pe);
    }
    if (hostEmailDispute && !emailsEqual(hostEmailDispute, actor))
        toAlert.add(hostEmailDispute.trim());
    if (toAlert.size > 0) {
        await notifyMatchEmails([...toAlert], {
            type: "match_score_disputed",
            title: "Score disputed",
            body: `${actor} disputed the proposed score for "${match.title}". The organiser should review and reopen when ready.`,
            matchId: match.id,
        });
    }
    return res.json(await withHostJson(updated));
});
matchesRouter.post("/:id/reopen-dispute", async (req, res) => {
    const actor = String(req.body.email || "").trim();
    if (!actor)
        return res.status(400).json({ error: "email is required" });
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match)
        return res.status(404).json({ error: "Match not found" });
    if (match.status !== MatchStatus.disputed) {
        return res.status(409).json({ error: "Match is not disputed" });
    }
    const hostEmail = await getHostEmail(match);
    if (!hostEmail || !emailsEqual(actor, hostEmail)) {
        return res.status(403).json({ error: "Only the organiser can reopen a disputed match" });
    }
    const updated = await prisma.match.update({
        where: { id: req.params.id },
        data: {
            status: MatchStatus.in_progress,
            scoreDisputeReason: null,
            disputedBy: null,
            disputedAt: null,
        },
    });
    const recipients = match.players.filter((p) => !emailsEqual(p, actor));
    if (recipients.length > 0) {
        await notifyMatchEmails(recipients, {
            type: "match_dispute_reopened",
            title: "Dispute cleared",
            body: `The organiser reopened "${match.title}". You can enter a new score proposal.`,
            matchId: match.id,
        });
    }
    return res.json(await withHostJson(updated));
});
matchesRouter.get("/:id/chat-messages", async (req, res) => {
    const viewerEmail = String(req.query.email || "").trim().toLowerCase();
    if (viewerEmail) {
        const pendingDelivered = await prisma.chatMessage.findMany({
            where: {
                matchId: req.params.id,
                senderEmail: { not: viewerEmail },
                status: "sent",
            },
            orderBy: { createdAt: "asc" },
            take: 400,
        });
        if (pendingDelivered.length > 0) {
            const deliveredAt = new Date();
            await prisma.$transaction(pendingDelivered.map((m) => prisma.chatMessage.update({
                where: { id: m.id },
                data: {
                    status: "delivered",
                    deliveredAt,
                },
            })));
            emitMatchReceipt(req.params.id, {
                messageIds: pendingDelivered.map((m) => m.id),
                status: "delivered",
                actorEmail: viewerEmail,
                at: deliveredAt,
            });
        }
    }
    const messages = await prisma.chatMessage.findMany({
        where: { matchId: req.params.id },
        orderBy: { createdAt: "asc" },
        take: 400,
    });
    res.json(await enrichMatchChatMessages(messages));
});
matchesRouter.post("/:id/chat-messages", async (req, res) => {
    const matchId = req.params.id;
    const { senderEmail, senderName, text, replyToId: replyToIdRaw } = req.body;
    if (!senderEmail || !senderName || !text) {
        return res
            .status(400)
            .json({ error: "senderEmail, senderName and text are required" });
    }
    let replyFields = {};
    if (replyToIdRaw && String(replyToIdRaw).trim()) {
        const quoted = await prisma.chatMessage.findFirst({
            where: { id: String(replyToIdRaw).trim(), matchId },
        });
        if (!quoted) {
            return res.status(400).json({ error: "Quoted message not found in this match" });
        }
        replyFields = {
            replyToId: quoted.id,
            replyToTextSnapshot: excerptReplyText(quoted.text),
            replyToSenderSnapshot: quoted.senderName,
            replyToSenderEmail: quoted.senderEmail,
        };
    }
    const created = await prisma.chatMessage.create({
        data: {
            matchId,
            senderEmail,
            senderName,
            text,
            readBy: [senderEmail],
            status: "sent",
            ...replyFields,
        },
    });
    const [enriched] = await enrichMatchChatMessages([created]);
    emitMatchMessage(matchId, enriched);
    const matchRow = await prisma.match.findUnique({
        where: { id: matchId },
        select: { title: true, players: true },
    });
    if (matchRow?.players?.length) {
        const excerpt = text.length > 140 ? `${text.slice(0, 137)}…` : text;
        const recipients = matchRow.players.filter((p) => !emailsEqual(p, senderEmail));
        if (recipients.length > 0) {
            await notifyMatchEmails(recipients, {
                type: "match_chat_message",
                title: `Match chat · ${matchRow.title}`,
                body: `${senderName}: ${excerpt}`,
                matchId,
            });
        }
    }
    await syncMatchConversationInbox(matchId);
    return res.status(201).json(enriched);
});
matchesRouter.post("/:id/chat-read", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email)
        return res.status(400).json({ error: "email is required" });
    const pendingRead = await prisma.chatMessage.findMany({
        where: {
            matchId: req.params.id,
            senderEmail: { not: email },
            NOT: { readBy: { has: email } },
        },
        orderBy: { createdAt: "asc" },
        take: 400,
    });
    if (pendingRead.length === 0) {
        await syncMatchConversationInbox(req.params.id);
        return res.json({ success: true, updated: 0 });
    }
    const readAt = new Date();
    await prisma.$transaction(pendingRead.map((m) => prisma.chatMessage.update({
        where: { id: m.id },
        data: {
            readBy: [...m.readBy, email],
            status: "read",
            readAt,
        },
    })));
    emitMatchReceipt(req.params.id, {
        messageIds: pendingRead.map((m) => m.id),
        status: "read",
        actorEmail: email,
        at: readAt,
    });
    await syncMatchConversationInbox(req.params.id);
    return res.json({ success: true, updated: pendingRead.length });
});
