import { prisma } from "./prisma.js";
import { DEFAULT_ELO, ELO_FLOOR, averageElo, eloDelta, kFactorFromMatchTags, resolveEffectiveElo, skillLabelFromElo, } from "./elo.js";
function normalizeWinner(w) {
    if (!w)
        return null;
    const s = String(w).toLowerCase().replace(/[\s-]+/g, "_");
    if (s === "team_a" || s === "teama")
        return "team_a";
    if (s === "team_b" || s === "teamb")
        return "team_b";
    return null;
}
/**
 * Persist Elo + recent form when a match first becomes completed.
 * Call only after the match row is saved with status completed and winnerTeam set.
 */
export async function applyEloAfterCompletedMatch(match) {
    const winner = normalizeWinner(match.winnerTeam);
    if (!winner)
        return;
    let teamA = match.teamA.filter((e) => match.players.includes(e));
    let teamB = match.teamB.filter((e) => match.players.includes(e));
    if (!teamA.length && !teamB.length && match.players.length === 2) {
        teamA = [match.players[0]];
        teamB = [match.players[1]];
    }
    const allRatedRoster = [...new Set([...teamA, ...teamB])];
    if (!teamA.length || !teamB.length)
        return;
    if (match.players.some((p) => !allRatedRoster.includes(p)))
        return;
    const k = kFactorFromMatchTags(match.tags);
    const now = new Date();
    const usersResolved = await prisma.user.findMany({
        where: {
            OR: allRatedRoster.map((e) => ({
                email: { equals: e.trim(), mode: "insensitive" },
            })),
        },
        include: { playerStats: true },
    });
    const byLower = new Map(usersResolved.map((u) => [u.email.trim().toLowerCase(), u]));
    const canonical = (rosterEmail) => {
        const u = byLower.get(rosterEmail.trim().toLowerCase());
        return u ? u.email : null;
    };
    for (const e of allRatedRoster) {
        if (!canonical(e)) {
            console.warn("[elo] Skipping match Elo: not all participants have user rows");
            return;
        }
    }
    teamA = teamA.map((e) => canonical(e));
    teamB = teamB.map((e) => canonical(e));
    const allRated = [...new Set([...teamA, ...teamB])];
    const users = allRated.map((email) => byLower.get(email.trim().toLowerCase()));
    if (users.length !== allRated.length) {
        console.warn("[elo] Skipping match Elo: participant resolution mismatch");
        return;
    }
    const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
    const oppAvgFor = (email) => {
        const oppEmails = teamA.includes(email) ? teamB : teamA;
        return averageElo(oppEmails.map((e) => {
            const u = byEmail[e];
            const stored = u.playerStats?.eloRating ?? u.eloRating ?? DEFAULT_ELO;
            const lastAt = u.playerStats?.lastMatchAt ?? null;
            return resolveEffectiveElo(stored, lastAt, now);
        }));
    };
    const calcs = allRated.map((email) => {
        const u = byEmail[email];
        const stored = u.playerStats?.eloRating ?? u.eloRating ?? DEFAULT_ELO;
        const lastAt = u.playerStats?.lastMatchAt ?? null;
        const effective = resolveEffectiveElo(stored, lastAt, now);
        const onA = teamA.includes(email);
        const won = (winner === "team_a" && onA) || (winner === "team_b" && !onA);
        const ps = u.playerStats;
        return {
            email,
            userId: u.id,
            effective,
            won,
            oppAvg: 0,
            delta: 0,
            newStored: effective,
            prevPlayed: ps?.matchesPlayed ?? 0,
            prevWon: ps?.matchesWon ?? 0,
            prevLost: ps?.matchesLost ?? 0,
            prevPeak: ps?.eloPeak ?? Math.max(stored, DEFAULT_ELO),
        };
    });
    for (const c of calcs) {
        c.oppAvg = oppAvgFor(c.email);
    }
    for (const c of calcs) {
        c.delta = eloDelta(c.effective, c.oppAvg, c.won ? 1 : 0, k);
        c.newStored = Math.max(ELO_FLOOR, c.effective + c.delta);
    }
    const scoreSummary = [match.scoreTeamA, match.scoreTeamB].filter(Boolean).join(" · ") || null;
    const eventType = match.tags?.some((t) => String(t).toLowerCase() === "tournament")
        ? "tournament"
        : "casual";
    await prisma.$transaction([
        ...calcs.map((c) => {
            const oppEmails = teamA.includes(c.email) ? teamB : teamA;
            const matchesPlayed = c.prevPlayed + 1;
            const matchesWon = c.prevWon + (c.won ? 1 : 0);
            const matchesLost = c.prevLost + (c.won ? 0 : 1);
            const matchWinPct = matchesPlayed > 0 ? Math.round((matchesWon / matchesPlayed) * 100) : 0;
            const newPeak = Math.max(c.prevPeak, c.newStored);
            const label = skillLabelFromElo(c.newStored);
            return prisma.playerStats.upsert({
                where: { userId: c.userId },
                create: {
                    userId: c.userId,
                    userEmail: c.email,
                    matchesPlayed,
                    matchesWon,
                    matchesLost,
                    matchWinPct,
                    eloRating: c.newStored,
                    eloPeak: newPeak,
                    skillLabel: label,
                    lastMatchAt: now,
                },
                update: {
                    userEmail: c.email,
                    matchesPlayed,
                    matchesWon,
                    matchesLost,
                    matchWinPct,
                    eloRating: c.newStored,
                    eloPeak: newPeak,
                    skillLabel: label,
                    lastMatchAt: now,
                },
            });
        }),
        ...calcs.map((c) => prisma.user.update({
            where: { id: c.userId },
            data: {
                eloRating: c.newStored,
                skillLabel: skillLabelFromElo(c.newStored),
            },
        })),
        ...calcs.map((c) => {
            const oppEmails = teamA.includes(c.email) ? teamB : teamA;
            return prisma.playerRecentForm.create({
                data: {
                    userEmail: c.email,
                    matchId: match.id,
                    matchTitle: match.title,
                    matchDate: match.date,
                    eventType,
                    matchFormat: match.matchType,
                    result: c.won ? "win" : "loss",
                    opponentEmails: oppEmails,
                    scoreSummary,
                    eloChange: c.delta,
                    eloAfter: c.newStored,
                },
            });
        }),
    ]);
}
