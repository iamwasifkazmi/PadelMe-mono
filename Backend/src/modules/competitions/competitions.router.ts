import { Router } from "express";
import {
  CompetitionFormat,
  CompetitionStatus,
  CompetitionType,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

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
    scoringMode: string;
    numSets: number;
    gamesPerSet: number;
    tiebreakRule: string;
  }>;
  if (!body.name) return res.status(400).json({ error: "name is required" });
  const lat = body.locationLat;
  const lng = body.locationLng;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "locationLat and locationLng are required (exact venue coordinates)" });
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
      scoringMode: body.scoringMode ?? undefined,
      numSets: body.numSets ?? undefined,
      gamesPerSet: body.gamesPerSet ?? undefined,
      tiebreakRule: body.tiebreakRule ?? undefined,
    },
  });
  return res.status(201).json(created);
});

competitionsRouter.get("/:id", async (req, res) => {
  const competition = await prisma.competition.findUnique({
    where: { id: req.params.id },
    include: { matches: true },
  });
  if (!competition) return res.status(404).json({ error: "Competition not found" });
  return res.json(competition);
});

competitionsRouter.post("/:id/advance-bracket", async (req, res) => {
  const competition = await prisma.competition.findUnique({
    where: { id: req.params.id },
  });
  if (!competition) return res.status(404).json({ error: "Competition not found" });
  return res.json({
    status: "queued",
    message: "Bracket advance logic will be added in next phase",
  });
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
