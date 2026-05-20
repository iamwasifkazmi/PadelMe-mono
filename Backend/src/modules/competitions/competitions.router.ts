import { Router } from "express";
import {
  CompetitionFormat,
  CompetitionStatus,
  CompetitionType,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  advanceBracketAfterConfirmedMatch,
  generateKnockoutRound1,
  resolveParticipantSlots,
} from "../../lib/competitionBracket.js";
import { generateLeagueWeekFixtures } from "../../lib/competitionLeague.js";
import {
  confirmCompetitionMatchScore,
  submitCompetitionMatchScore,
  validateSubmittedCompetitionScore,
} from "../../lib/competitionMatchScore.js";

export const competitionsRouter = Router();

competitionsRouter.get("/", async (_req, res) => {
  const competitions = await prisma.competition.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(competitions);
});

competitionsRouter.post("/", async (req, res) => {
  const body = req.body as Partial<{
    name: string;
    description: string;
    type: CompetitionType;
    format: CompetitionFormat;
    visibility: string;
    hostEmail: string;
    locationName: string;
    locationAddress: string;
    locationLat: number;
    locationLng: number;
    startDate: string;
    endDate: string;
    maxPlayers: number;
    skillLevel: string;
    entryFee: number;
    prizePool: number;
    prizeType: string;
    prizeDescription: string;
    scoringMode: string;
    numSets: number;
    gamesPerSet: number;
    tiebreakRule: string;
    weeklyDay: string;
    leagueWeeks: number;
    teamStructure: string;
    genderRequirement: string;
    ageMin: number;
    ageMax: number;
    skillRangeMin: number;
    skillRangeMax: number;
    minRatingThreshold: number;
    verificationRequirement: string;
    isVerifiedOnly: boolean;
    pointsWin: number;
    pointsLoss: number;
    pointsDraw: number;
    allowDraws: boolean;
    invitedEmails: string[];
  }>;

  if (!body.name) return res.status(400).json({ error: "name is required" });
  const lat = body.locationLat;
  const lng = body.locationLng;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return res.status(400).json({
      error: "locationLat and locationLng are required (exact venue coordinates)",
    });
  }
  if (!String(body.locationName || "").trim()) {
    return res.status(400).json({ error: "locationName is required" });
  }

  const created = await prisma.competition.create({
    data: {
      name: body.name,
      description: body.description || undefined,
      type: body.type || CompetitionType.tournament,
      format: body.format || CompetitionFormat.knockout,
      status: CompetitionStatus.registration,
      visibility: body.visibility || "public",
      invitedEmails: body.invitedEmails || [],
      hostEmail: body.hostEmail || undefined,
      locationName: body.locationName || undefined,
      locationAddress: body.locationAddress || undefined,
      locationLat: lat,
      locationLng: lng,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      maxPlayers: body.maxPlayers ?? 16,
      skillLevel: body.skillLevel ?? "any",
      entryFee: body.entryFee ?? undefined,
      prizePool: body.prizePool ?? undefined,
      prizeType: body.prizeType || undefined,
      prizeDescription: body.prizeDescription || undefined,
      scoringMode: body.scoringMode ?? undefined,
      numSets: body.numSets ?? undefined,
      gamesPerSet: body.gamesPerSet ?? undefined,
      tiebreakRule: body.tiebreakRule ?? undefined,
      weeklyDay: body.weeklyDay || undefined,
      leagueWeeks: body.leagueWeeks ?? undefined,
      teamStructure: body.teamStructure || "singles",
      genderRequirement: body.genderRequirement || "any",
      ageMin: body.ageMin ?? undefined,
      ageMax: body.ageMax ?? undefined,
      skillRangeMin: body.skillRangeMin ?? undefined,
      skillRangeMax: body.skillRangeMax ?? undefined,
      minRatingThreshold: body.minRatingThreshold ?? undefined,
      verificationRequirement: body.verificationRequirement ?? "none",
      isVerifiedOnly: body.isVerifiedOnly ?? false,
      pointsWin: body.pointsWin ?? 3,
      pointsLoss: body.pointsLoss ?? 0,
      pointsDraw: body.pointsDraw ?? 1,
      allowDraws: body.allowDraws ?? false,
    },
  });
  return res.status(201).json(created);
});

competitionsRouter.get("/:id", async (req, res) => {
  const competition = await prisma.competition.findUnique({
    where: { id: req.params.id },
    include: { matches: { orderBy: [{ round: "asc" }, { matchOrder: "asc" }] } },
  });
  if (!competition) return res.status(404).json({ error: "Competition not found" });
  return res.json(competition);
});

competitionsRouter.post("/:id/join", async (req, res) => {
  const email = String(req.body.email || "");
  if (!email) return res.status(400).json({ error: "email is required" });

  const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!competition) return res.status(404).json({ error: "Competition not found" });

  if (competition.participants.includes(email)) return res.json(competition);

  const maxPlayers = competition.maxPlayers ?? 16;
  if (competition.participants.length >= maxPlayers) {
    return res.status(409).json({ error: "Competition is full" });
  }

  const updated = await prisma.competition.update({
    where: { id: req.params.id },
    data: { participants: [...competition.participants, email] },
  });
  return res.json(updated);
});

/** Start tournament / league — generates bracket or week 1 fixtures (Base44 handleStartTournament). */
competitionsRouter.post("/:id/start", async (req, res) => {
  const hostEmail = String(req.body.email || req.body.hostEmail || "");
  const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!competition) return res.status(404).json({ error: "Competition not found" });

  if (hostEmail && competition.hostEmail && competition.hostEmail !== hostEmail) {
    return res.status(403).json({ error: "Only the organiser can start this competition" });
  }
  if (competition.status !== CompetitionStatus.registration) {
    return res.status(409).json({ error: "Competition is not in registration" });
  }
  if (competition.participants.length < 2) {
    return res.status(400).json({ error: "At least 2 participants required" });
  }

  const existingMatches = await prisma.competitionMatch.count({
    where: { competitionId: competition.id },
  });
  if (existingMatches > 0) {
    return res.status(409).json({ error: "Competition already started" });
  }

  await prisma.competition.update({
    where: { id: competition.id },
    data: { status: CompetitionStatus.in_progress },
  });

  let matchesCreated = 0;
  if (competition.type === CompetitionType.league) {
    const fixtures = await generateLeagueWeekFixtures(
      { ...competition, status: CompetitionStatus.in_progress },
      1,
    );
    matchesCreated = fixtures.length;
  } else if (competition.format === CompetitionFormat.knockout) {
    const slots = await resolveParticipantSlots(competition.participants);
    const created = await generateKnockoutRound1(competition, slots);
    matchesCreated = created.length;
  } else {
    const slots = await resolveParticipantSlots(competition.participants);
    const shuffled = [...slots].sort(() => Math.random() - 0.5);
    const rows = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      if (shuffled[i + 1]) {
        rows.push({
          competitionId: competition.id,
          round: 1,
          roundName: "Round 1",
          player1Email: shuffled[i].email,
          player1Name: shuffled[i].name,
          player2Email: shuffled[i + 1].email,
          player2Name: shuffled[i + 1].name,
          status: "scheduled",
          matchOrder: i / 2 + 1,
        });
      }
    }
    if (rows.length) {
      await prisma.competitionMatch.createMany({ data: rows });
      matchesCreated = rows.length;
    }
  }

  const updated = await prisma.competition.findUnique({
    where: { id: competition.id },
    include: { matches: { orderBy: [{ round: "asc" }, { matchOrder: "asc" }] } },
  });

  return res.json({
    status: "started",
    message:
      competition.type === "league"
        ? "League started — week 1 fixtures generated"
        : "Tournament started — bracket generated",
    matchesCreated,
    competition: updated,
  });
});

competitionsRouter.post("/:id/advance-bracket", async (req, res) => {
  const competition = await prisma.competition.findUnique({
    where: { id: req.params.id },
  });
  if (!competition) return res.status(404).json({ error: "Competition not found" });

  const confirmedMatchId = String(
    req.body.confirmedMatchId || req.body.confirmed_match_id || "",
  );
  if (!confirmedMatchId) {
    return res.status(400).json({ error: "confirmedMatchId is required" });
  }

  const result = await advanceBracketAfterConfirmedMatch(
    competition.id,
    confirmedMatchId,
  );
  return res.json(result);
});

competitionsRouter.post("/:id/matches/:matchId/submit-score", async (req, res) => {
  const email = String(req.body.email || "");
  const scoreP1 = String(req.body.scoreP1 ?? req.body.score_p1 ?? "");
  const scoreP2 = String(req.body.scoreP2 ?? req.body.score_p2 ?? "");
  if (!email) return res.status(400).json({ error: "email is required" });

  const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!competition) return res.status(404).json({ error: "Competition not found" });

  const match = await prisma.competitionMatch.findFirst({
    where: { id: req.params.matchId, competitionId: competition.id },
  });
  if (!match) return res.status(404).json({ error: "Match not found" });

  try {
    const updated = await submitCompetitionMatchScore(
      competition,
      match,
      email,
      scoreP1,
      scoreP2,
    );
    return res.json(updated);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

competitionsRouter.post("/:id/matches/:matchId/confirm-score", async (req, res) => {
  const email = String(req.body.email || "");
  if (!email) return res.status(400).json({ error: "email is required" });

  const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!competition) return res.status(404).json({ error: "Competition not found" });

  const match = await prisma.competitionMatch.findFirst({
    where: { id: req.params.matchId, competitionId: competition.id },
  });
  if (!match) return res.status(404).json({ error: "Match not found" });

  try {
    const updated = await validateSubmittedCompetitionScore(
      competition,
      match,
      email,
      true,
    );
    return res.json(updated);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

competitionsRouter.post("/:id/matches/:matchId/reject-score", async (req, res) => {
  const email = String(req.body.email || "");
  const reason = String(req.body.reason || "");
  if (!email) return res.status(400).json({ error: "email is required" });

  const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!competition) return res.status(404).json({ error: "Competition not found" });

  const match = await prisma.competitionMatch.findFirst({
    where: { id: req.params.matchId, competitionId: competition.id },
  });
  if (!match) return res.status(404).json({ error: "Match not found" });

  try {
    const updated = await validateSubmittedCompetitionScore(
      competition,
      match,
      email,
      false,
      reason,
    );
    return res.json(updated);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

competitionsRouter.post("/:id/matches/:matchId/host-score", async (req, res) => {
  const email = String(req.body.email || "");
  const scoreP1 = String(req.body.scoreP1 ?? req.body.score_p1 ?? "");
  const scoreP2 = String(req.body.scoreP2 ?? req.body.score_p2 ?? "");
  if (!email) return res.status(400).json({ error: "email is required" });

  const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!competition) return res.status(404).json({ error: "Competition not found" });
  if (competition.hostEmail !== email) {
    return res.status(403).json({ error: "Only the organiser can enter scores directly" });
  }

  const match = await prisma.competitionMatch.findFirst({
    where: { id: req.params.matchId, competitionId: competition.id },
  });
  if (!match) return res.status(404).json({ error: "Match not found" });

  try {
    const updated = await confirmCompetitionMatchScore(
      competition,
      match,
      email,
      scoreP1,
      scoreP2,
      { hostOverride: true },
    );
    return res.json(updated);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});
