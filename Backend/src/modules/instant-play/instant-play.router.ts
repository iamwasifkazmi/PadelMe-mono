import { Router } from "express";
import { MatchStatus, MatchType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { dedupeEmailsCi, playersIncludesCi } from "../../lib/emailsCi.js";
import { matchIsDiscoverableJoinable } from "../../lib/matchListing.js";

export const instantPlayRouter = Router();

async function canonicalUserEmail(raw: string): Promise<string> {
  const trimmed = raw.trim();
  const u = await prisma.user.findFirst({
    where: { email: { equals: trimmed, mode: "insensitive" } },
  });
  return (u?.email ?? trimmed).trim();
}

function coerceMatchType(raw: unknown): MatchType {
  const s = String(raw ?? "").toLowerCase();
  if (s === "singles") return MatchType.singles;
  if (s === "mixed" || s === "mixed_doubles") return MatchType.mixed_doubles;
  return MatchType.doubles;
}

instantPlayRouter.post("/join", async (req, res) => {
  const {
    userEmail,
    userName,
    matchType: matchTypeRaw,
    locationName,
    locationLat,
    locationLng,
    skillLevel = "any",
  } = req.body as Partial<{
    userEmail: string;
    userName: string;
    matchType: unknown;
    locationName: string;
    locationLat: number;
    locationLng: number;
    skillLevel: string;
  }>;

  const matchType = coerceMatchType(matchTypeRaw);

  if (!userEmail) return res.status(400).json({ error: "userEmail is required" });

  const canonical = await canonicalUserEmail(userEmail);

  const openInstantCandidates = await prisma.match.findMany({
    where: {
      status: MatchStatus.open,
      isInstant: true,
      matchType,
    },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  const openInstant =
    openInstantCandidates.find((m) =>
      matchIsDiscoverableJoinable({
        players: m.players,
        confirmedPlayerEmails: m.confirmedPlayerEmails,
        maxPlayers: m.maxPlayers,
      }),
    ) ?? null;

  if (openInstant && !playersIncludesCi(openInstant.players, canonical)) {
    const players = dedupeEmailsCi([...openInstant.players, canonical]);
    const updated = await prisma.match.update({
      where: { id: openInstant.id },
      data: {
        players,
        status: players.length >= openInstant.maxPlayers ? MatchStatus.full : MatchStatus.open,
      },
    });
    return res.json({ status: "matched", matchId: updated.id });
  }

  const requestRow = await prisma.instantPlayRequest.create({
    data: {
      userEmail,
      userName,
      skillLevel,
      locationName,
      locationLat: locationLat ?? null,
      locationLng: locationLng ?? null,
      matchType,
      status: "waiting",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  const waiting = await prisma.instantPlayRequest.findMany({
    where: { status: "waiting", matchType },
    orderBy: { createdAt: "asc" },
    take: 4,
  });

  const needed = (matchType === MatchType.singles ? 2 : 4);
  if (waiting.length >= needed) {
    const selected = waiting.slice(0, needed);
    const emails = dedupeEmailsCi(selected.map((r) => r.userEmail));
    const anchor = selected[0];
    const resolvedName = anchor?.locationName || locationName || "Nearby Court";
    const resolvedLat = anchor?.locationLat ?? locationLat ?? null;
    const resolvedLng = anchor?.locationLng ?? locationLng ?? null;
    const createdMatch = await prisma.match.create({
      data: {
        title: "⚡ Instant Padel",
        date: new Date(),
        timeLabel: new Date().toTimeString().slice(0, 5),
        locationName: resolvedName,
        locationLat: resolvedLat,
        locationLng: resolvedLng,
        skillLevel,
        maxPlayers: needed,
        players: emails,
        status: MatchStatus.open,
        isInstant: true,
        matchType,
      },
    });
    await prisma.instantPlayRequest.updateMany({
      where: { id: { in: selected.map((r) => r.id) } },
      data: { status: "matched", matchedMatchId: createdMatch.id },
    });
    return res.json({ status: "matched", matchId: createdMatch.id, requestId: requestRow.id });
  }

  const nearbyMatchesRaw = await prisma.match.findMany({
    where: {
      status: MatchStatus.open,
      isInstant: true,
      matchType,
      NOT: { players: { has: userEmail } },
    },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
  const nearbyMatches = nearbyMatchesRaw
    .filter((m) =>
      matchIsDiscoverableJoinable({
        players: m.players,
        confirmedPlayerEmails: m.confirmedPlayerEmails,
        maxPlayers: m.maxPlayers,
      }),
    )
    .slice(0, 8);

  const nearbySummary = nearbyMatches.map((m) => ({
    id: m.id,
    title: m.title,
    locationName: m.locationName,
    playersCount: m.players.length,
    maxPlayers: m.maxPlayers,
    timeLabel: m.timeLabel,
    date: m.date,
  }));

  return res.json({
    status: "waiting",
    requestId: requestRow.id,
    nearbyMatches: nearbySummary,
  });
});

instantPlayRouter.post("/join-match", async (req, res) => {
  const matchId = String(req.body.matchId || "");
  const userEmail = String(req.body.userEmail || "");
  if (!matchId || !userEmail) {
    return res.status(400).json({ error: "matchId and userEmail are required" });
  }
  const canonical = await canonicalUserEmail(userEmail);
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (playersIncludesCi(match.players, canonical)) return res.json({ status: "matched", matchId });
  if (
    !matchIsDiscoverableJoinable({
      players: match.players,
      confirmedPlayerEmails: match.confirmedPlayerEmails,
      maxPlayers: match.maxPlayers,
    })
  ) {
    return res.status(409).json({ error: "This game is full or closed to new players" });
  }
  if (dedupeEmailsCi(match.players).length >= match.maxPlayers) {
    return res.status(409).json({ error: "Match full" });
  }

  const players = dedupeEmailsCi([...match.players, canonical]);
  await prisma.match.update({
    where: { id: matchId },
    data: {
      players,
      status: players.length >= match.maxPlayers ? MatchStatus.full : MatchStatus.open,
    },
  });
  return res.json({ status: "matched", matchId });
});

instantPlayRouter.get("/status/:requestId", async (req, res) => {
  const request = await prisma.instantPlayRequest.findUnique({
    where: { id: req.params.requestId },
  });
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.expiresAt && request.expiresAt < new Date() && request.status === "waiting") {
    await prisma.instantPlayRequest.update({
      where: { id: request.id },
      data: { status: "expired" },
    });
    return res.json({ status: "expired" });
  }
  return res.json({ status: request.status, matchId: request.matchedMatchId });
});

instantPlayRouter.post("/cancel", async (req, res) => {
  const requestId = String(req.body.requestId || "");
  if (!requestId) return res.status(400).json({ error: "requestId is required" });
  await prisma.instantPlayRequest.update({
    where: { id: requestId },
    data: { status: "expired" },
  });
  res.json({ status: "cancelled" });
});

instantPlayRouter.post("/confirm", async (req, res) => {
  const requestId = String(req.body.requestId || "");
  if (!requestId) return res.status(400).json({ error: "requestId is required" });
  await prisma.instantPlayRequest.update({
    where: { id: requestId },
    data: { status: "confirmed" },
  });
  res.json({ status: "confirmed" });
});

instantPlayRouter.post("/decline", async (req, res) => {
  const requestId = String(req.body.requestId || "");
  if (!requestId) return res.status(400).json({ error: "requestId is required" });
  await prisma.instantPlayRequest.update({
    where: { id: requestId },
    data: { status: "declined" },
  });
  res.json({ status: "declined" });
});
