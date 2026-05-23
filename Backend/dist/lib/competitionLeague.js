import { prisma } from "./prisma.js";
import { resolveParticipantSlots } from "./competitionBracket.js";
const DAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];
/** Round-robin week fixtures for a league (Base44 generateWeeklyFixtures). */
export async function generateLeagueWeekFixtures(league, weekNumber) {
    const currentWeek = league.currentWeek ?? 0;
    const nextWeek = weekNumber ?? currentWeek + 1;
    const totalWeeks = league.leagueWeeks ?? 0;
    if (totalWeeks > 0 && nextWeek > totalWeeks) {
        await prisma.competition.update({
            where: { id: league.id },
            data: { status: "completed" },
        });
        return [];
    }
    const slots = await resolveParticipantSlots(league.participants);
    if (slots.length < 2)
        return [];
    const rotated = [...slots];
    const rotations = Math.max(0, nextWeek - 1);
    for (let r = 0; r < rotations; r++) {
        if (rotated.length <= 1)
            break;
        const last = rotated.pop();
        rotated.splice(1, 0, last);
    }
    const rows = [];
    for (let i = 0; i < Math.floor(rotated.length / 2); i++) {
        const p1 = rotated[i];
        const p2 = rotated[rotated.length - 1 - i];
        if (!p1 || !p2)
            continue;
        rows.push({
            competitionId: league.id,
            round: nextWeek,
            roundName: `Week ${nextWeek}`,
            player1Email: p1.email,
            player1Name: p1.name,
            player2Email: p2.email,
            player2Name: p2.name,
            status: "scheduled",
            matchOrder: i + 1,
        });
    }
    if (!rows.length)
        return [];
    await prisma.competitionMatch.createMany({ data: rows });
    await prisma.competition.update({
        where: { id: league.id },
        data: { currentWeek: nextWeek },
    });
    return prisma.competitionMatch.findMany({
        where: { competitionId: league.id, round: nextWeek },
        orderBy: { matchOrder: "asc" },
    });
}
export function todayWeekdayName() {
    return DAYS[new Date().getDay()];
}
/** Cron: generate fixtures for in-progress leagues scheduled for today. */
export async function runWeeklyLeagueFixtureGeneration() {
    const todayDay = todayWeekdayName();
    const leagues = await prisma.competition.findMany({
        where: {
            type: "league",
            status: "in_progress",
            weeklyDay: todayDay,
        },
    });
    const results = [];
    for (const league of leagues) {
        const totalWeeks = league.leagueWeeks ?? 0;
        const currentWeek = league.currentWeek ?? 0;
        if (totalWeeks > 0 && currentWeek >= totalWeeks) {
            await prisma.competition.update({
                where: { id: league.id },
                data: { status: "completed" },
            });
            results.push({ leagueId: league.id, action: "completed" });
            continue;
        }
        if (league.participants.length < 2) {
            results.push({ leagueId: league.id, action: "skipped", reason: "not enough players" });
            continue;
        }
        const created = await generateLeagueWeekFixtures(league);
        results.push({
            leagueId: league.id,
            action: "fixtures_generated",
            week: (league.currentWeek ?? 0) + 1,
            matches: created.length,
        });
    }
    return results;
}
