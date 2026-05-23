import { MatchStatus } from "@prisma/client";
import { prisma } from "./prisma.js";
const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];
function advanceDate(date, frequency) {
    if (frequency === "daily")
        date.setDate(date.getDate() + 1);
    else if (frequency === "weekly")
        date.setDate(date.getDate() + 7);
    else if (frequency === "biweekly")
        date.setDate(date.getDate() + 14);
    else if (frequency === "monthly")
        date.setMonth(date.getMonth() + 1);
}
function cloneMatchOccurrence(parent, occurrenceDate, occurrenceNumber, players) {
    const seriesId = parent.recurringMatchId || parent.id;
    return {
        title: parent.title,
        date: occurrenceDate,
        timeLabel: parent.timeLabel,
        durationMinutes: parent.durationMinutes ?? undefined,
        locationName: parent.locationName,
        locationAddress: parent.locationAddress ?? undefined,
        locationLat: parent.locationLat ?? undefined,
        locationLng: parent.locationLng ?? undefined,
        country: parent.country ?? undefined,
        skillLevel: parent.skillLevel ?? undefined,
        maxPlayers: parent.maxPlayers,
        matchType: parent.matchType,
        scoringMode: parent.scoringMode,
        numSets: parent.numSets,
        gamesPerSet: parent.gamesPerSet,
        tiebreakRule: parent.tiebreakRule,
        notes: parent.notes ?? undefined,
        tags: parent.tags,
        visibility: parent.visibility,
        invitedEmails: parent.invitedEmails,
        verificationRequirement: parent.verificationRequirement ?? "none",
        genderRequirement: parent.genderRequirement ?? "any",
        ageMin: parent.ageMin ?? undefined,
        ageMax: parent.ageMax ?? undefined,
        skillRangeMin: parent.skillRangeMin ?? undefined,
        skillRangeMax: parent.skillRangeMax ?? undefined,
        minRatingThreshold: parent.minRatingThreshold ?? undefined,
        status: MatchStatus.open,
        players,
        confirmedPlayerEmails: players.length ? [...players] : [],
        teamA: parent.playerGroupMode === "fixed" ? [...parent.teamA] : [],
        teamB: parent.playerGroupMode === "fixed" ? [...parent.teamB] : [],
        ...(parent.hostId ? { host: { connect: { id: parent.hostId } } } : {}),
        parentMatchId: seriesId,
        recurringMatchId: seriesId,
        occurrenceNumber,
        occurrenceDate,
        playerGroupMode: parent.playerGroupMode ?? "open",
        fixedPlayers: parent.fixedPlayers,
        isRecurring: false,
    };
}
export async function generateRecurringMatchesForParent(parentMatchId, startDateIso) {
    const parent = await prisma.match.findUnique({ where: { id: parentMatchId } });
    if (!parent)
        throw new Error("Parent match not found");
    if (!parent.isRecurring || !parent.recurrencePattern) {
        throw new Error("Match is not a recurring series parent");
    }
    const pattern = parent.recurrencePattern;
    const startDate = new Date(startDateIso);
    if (Number.isNaN(startDate.getTime()))
        throw new Error("Invalid startDate");
    const seriesId = parent.recurringMatchId || parent.id;
    if (!parent.recurringMatchId) {
        await prisma.match.update({
            where: { id: parent.id },
            data: { recurringMatchId: parent.id },
        });
    }
    const fixedPlayers = parent.playerGroupMode === "fixed"
        ? parent.fixedPlayers.length
            ? parent.fixedPlayers
            : parent.players
        : [];
    const occurrenceIds = [];
    let currentDate = new Date(startDate);
    let count = 0;
    const maxOccurrences = 52;
    while (count < maxOccurrences) {
        if (pattern.end_rule === "on_date" && pattern.end_date) {
            const end = new Date(pattern.end_date);
            if (currentDate > end)
                break;
        }
        if (pattern.end_rule === "after_count" && pattern.end_count != null) {
            if (count >= pattern.end_count)
                break;
        }
        if ((pattern.frequency === "weekly" || pattern.frequency === "biweekly") &&
            pattern.days?.length) {
            const dayName = DAY_NAMES[currentDate.getDay()];
            if (!pattern.days.includes(dayName)) {
                advanceDate(currentDate, pattern.frequency);
                continue;
            }
        }
        const players = parent.playerGroupMode === "fixed" && fixedPlayers.length
            ? [...fixedPlayers]
            : count === 0
                ? [...parent.players]
                : [];
        const occNum = count + 1;
        const isFirst = occNum === 1;
        if (isFirst) {
            await prisma.match.update({
                where: { id: parent.id },
                data: {
                    occurrenceNumber: 1,
                    occurrenceDate: currentDate,
                    parentMatchId: seriesId,
                    recurringMatchId: seriesId,
                },
            });
            occurrenceIds.push(parent.id);
        }
        else {
            const created = await prisma.match.create({
                data: cloneMatchOccurrence(parent, new Date(currentDate), occNum, players),
            });
            occurrenceIds.push(created.id);
        }
        count++;
        advanceDate(currentDate, pattern.frequency);
        if (pattern.end_rule === "never" && count >= maxOccurrences)
            break;
    }
    return { occurrencesCreated: occurrenceIds.length, occurrenceIds };
}
