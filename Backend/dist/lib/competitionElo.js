import { prisma } from "./prisma.js";
import { DEFAULT_ELO, ELO_FLOOR, averageElo, eloDelta, resolveEffectiveElo, skillLabelFromElo, } from "./elo.js";
/** Apply Elo + player stats once per confirmed competition match (Base44 updatePlayerStats parity). */
export async function applyEloAfterCompetitionMatch(competition, match) {
    if (match.statsUpdated)
        return;
    const isDoubles = (match.teamAEmails?.length ?? 0) > 0 || (match.teamBEmails?.length ?? 0) > 0;
    let winners = [];
    let losers = [];
    if (isDoubles) {
        const winTeam = match.winnerTeam === "team_b" ? match.teamBEmails : match.teamAEmails;
        const loseTeam = match.winnerTeam === "team_b" ? match.teamAEmails : match.teamBEmails;
        winners = [...(winTeam || [])];
        losers = [...(loseTeam || [])];
    }
    else {
        const w = match.winnerEmail;
        if (!w)
            return;
        winners = [w];
        const loser = w === match.player1Email ? match.player2Email : match.player1Email;
        if (loser)
            losers = [loser];
    }
    if (!winners.length || !losers.length)
        return;
    const k = competition.type === "tournament" ? 40 : 32;
    const now = new Date();
    const allEmails = [...new Set([...winners, ...losers])];
    const users = await prisma.user.findMany({
        where: {
            OR: allEmails.map((e) => ({
                email: { equals: e.trim(), mode: "insensitive" },
            })),
        },
        include: { playerStats: true },
    });
    const byLower = new Map(users.map((u) => [u.email.toLowerCase(), u]));
    const resolveEmail = (raw) => byLower.get(raw.trim().toLowerCase())?.email;
    const winnerCanon = winners.map(resolveEmail).filter(Boolean);
    const loserCanon = losers.map(resolveEmail).filter(Boolean);
    if (winnerCanon.length !== winners.length || loserCanon.length !== losers.length)
        return;
    const winnerAvg = averageElo(winnerCanon.map((e) => {
        const u = byLower.get(e.toLowerCase());
        return resolveEffectiveElo(u.eloRating, u.playerStats?.lastMatchAt ?? null, now);
    }));
    const loserAvg = averageElo(loserCanon.map((e) => {
        const u = byLower.get(e.toLowerCase());
        return resolveEffectiveElo(u.eloRating, u.playerStats?.lastMatchAt ?? null, now);
    }));
    for (const email of winnerCanon) {
        const u = byLower.get(email.toLowerCase());
        const effective = resolveEffectiveElo(u.eloRating, u.playerStats?.lastMatchAt ?? null, now);
        const delta = eloDelta(effective, loserAvg, 1, k);
        const newStored = Math.max(ELO_FLOOR, effective + delta);
        await prisma.user.update({
            where: { id: u.id },
            data: {
                eloRating: newStored,
                skillLabel: skillLabelFromElo(newStored),
            },
        });
        await prisma.playerStats.upsert({
            where: { userId: u.id },
            create: {
                userId: u.id,
                userEmail: u.email,
                eloRating: newStored,
                eloPeak: newStored,
                matchesPlayed: 1,
                matchesWon: 1,
                lastMatchAt: now,
            },
            update: {
                eloRating: newStored,
                eloPeak: Math.max(u.playerStats?.eloPeak ?? DEFAULT_ELO, newStored),
                matchesPlayed: { increment: 1 },
                matchesWon: { increment: 1 },
                lastMatchAt: now,
            },
        });
    }
    for (const email of loserCanon) {
        const u = byLower.get(email.toLowerCase());
        const effective = resolveEffectiveElo(u.eloRating, u.playerStats?.lastMatchAt ?? null, now);
        const delta = eloDelta(effective, winnerAvg, 0, k);
        const newStored = Math.max(ELO_FLOOR, effective + delta);
        await prisma.user.update({
            where: { id: u.id },
            data: {
                eloRating: newStored,
                skillLabel: skillLabelFromElo(newStored),
            },
        });
        await prisma.playerStats.upsert({
            where: { userId: u.id },
            create: {
                userId: u.id,
                userEmail: u.email,
                eloRating: newStored,
                eloPeak: newStored,
                matchesPlayed: 1,
                matchesLost: 1,
                lastMatchAt: now,
            },
            update: {
                eloRating: newStored,
                matchesPlayed: { increment: 1 },
                matchesLost: { increment: 1 },
                lastMatchAt: now,
            },
        });
    }
    await prisma.competitionMatch.update({
        where: { id: match.id },
        data: { statsUpdated: true },
    });
}
