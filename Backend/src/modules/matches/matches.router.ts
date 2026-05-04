import { Router } from "express";
import { MatchStatus, MatchType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { applyEloAfterCompletedMatch } from "../../lib/applyEloAfterCompletedMatch.js";
import { emitMatchMessage, emitMatchReceipt } from "../../lib/socket.js";

export const matchesRouter = Router();

matchesRouter.get("/", async (req, res) => {
  const status = req.query.status as MatchStatus | undefined;
  const skill = String(req.query.skill || "").trim().toLowerCase();
  const where = {
    ...(status ? { status } : {}),
    ...(skill ? { skillLevel: skill } : {}),
  };
  const matches = await prisma.match.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(matches);
});

matchesRouter.post("/", async (req, res) => {
  const body = req.body as Partial<{
    title: string;
    date: string;
    timeLabel: string;
    locationName: string;
    locationAddress: string;
    locationLat: number;
    locationLng: number;
    durationMinutes: number;
    notes: string;
    visibility: string;
    tags: string[];
    invitedEmails: string[];
    skillLevel: string;
    isInstant: boolean;
    maxPlayers: number;
    matchType: MatchType;
    createdByEmail: string;
    teamA: string[];
    teamB: string[];
  }>;
  if (!body.title || !body.timeLabel || !body.locationName) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const lat = body.locationLat;
  const lng = body.locationLng;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "locationLat and locationLng are required (exact venue coordinates)" });
  }
  const isInstant = body.isInstant === true;
  const parsedDate = body.date ? new Date(body.date) : new Date();
  const host = body.createdByEmail
    ? await prisma.user.findUnique({ where: { email: body.createdByEmail } })
    : null;

  const maxPlayers = body.maxPlayers || 4;
  const players = body.createdByEmail ? [body.createdByEmail] : [];
  const initialStatus =
    players.length >= maxPlayers ? MatchStatus.full : MatchStatus.open;

  const created = await prisma.match.create({
    data: {
      title: body.title,
      date: parsedDate,
      timeLabel: body.timeLabel,
      locationName: body.locationName,
      locationAddress: body.locationAddress || undefined,
      locationLat: lat,
      locationLng: lng,
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
      teamA: Array.isArray(body.teamA) ? body.teamA : [],
      teamB: Array.isArray(body.teamB) ? body.teamB : [],
      status: initialStatus,
      hostId: host?.id,
    },
  });
  return res.status(201).json(created);
});

matchesRouter.get("/:id", async (req, res) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  return res.json(match);
});

matchesRouter.post("/:id/join", async (req, res) => {
  const email = String(req.body.email || "");
  if (!email) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.players.includes(email)) return res.json(match);
  if (match.players.length >= match.maxPlayers) {
    return res.status(409).json({ error: "Match is full" });
  }
  const players = [...match.players, email];
  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: {
      players,
      status: players.length >= match.maxPlayers ? MatchStatus.full : MatchStatus.open,
    },
  });
  return res.json(updated);
});

matchesRouter.post("/:id/leave", async (req, res) => {
  const email = String(req.body.email || "");
  if (!email) return res.status(400).json({ error: "email is required" });

  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (!match.players.includes(email)) return res.json(match);

  const players = match.players.filter((p) => p !== email);
  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: {
      players,
      teamA: match.teamA.filter((p) => p !== email),
      teamB: match.teamB.filter((p) => p !== email),
      status: players.length >= match.maxPlayers ? MatchStatus.full : MatchStatus.open,
    },
  });
  return res.json(updated);
});

matchesRouter.post("/:id/start", async (req, res) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.status !== MatchStatus.open && match.status !== MatchStatus.full) {
    return res.status(409).json({ error: "Match cannot be started from current status" });
  }
  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: { status: MatchStatus.in_progress },
  });
  return res.json(updated);
});

matchesRouter.post("/:id/submit-score", async (req, res) => {
  const { scoreTeamA, scoreTeamB, winnerTeam } = req.body as Partial<{
    scoreTeamA: string;
    scoreTeamB: string;
    winnerTeam: string;
  }>;
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.status === MatchStatus.completed) {
    return res.json(match);
  }
  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: {
      scoreTeamA,
      scoreTeamB,
      winnerTeam,
      status: MatchStatus.completed,
    },
  });
  try {
    await applyEloAfterCompletedMatch(updated);
  } catch (err) {
    console.error("[elo] applyEloAfterCompletedMatch failed:", err);
  }
  return res.json(updated);
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
      await prisma.$transaction(
        pendingDelivered.map((m) =>
          prisma.chatMessage.update({
            where: { id: m.id },
            data: {
              status: "delivered",
              deliveredAt,
            },
          }),
        ),
      );
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
  res.json(messages);
});

matchesRouter.post("/:id/chat-messages", async (req, res) => {
  const { senderEmail, senderName, text } = req.body as Partial<{
    senderEmail: string;
    senderName: string;
    text: string;
  }>;
  if (!senderEmail || !senderName || !text) {
    return res
      .status(400)
      .json({ error: "senderEmail, senderName and text are required" });
  }

  const created = await prisma.chatMessage.create({
    data: {
      matchId: req.params.id,
      senderEmail,
      senderName,
      text,
      readBy: [senderEmail],
      status: "sent",
    },
  });
  emitMatchMessage(req.params.id, created);
  return res.status(201).json(created);
});

matchesRouter.post("/:id/chat-read", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "email is required" });

  const pendingRead = await prisma.chatMessage.findMany({
    where: {
      matchId: req.params.id,
      senderEmail: { not: email },
      NOT: { readBy: { has: email } },
    },
    orderBy: { createdAt: "asc" },
    take: 400,
  });

  if (pendingRead.length === 0) return res.json({ success: true, updated: 0 });

  const readAt = new Date();
  await prisma.$transaction(
    pendingRead.map((m) =>
      prisma.chatMessage.update({
        where: { id: m.id },
        data: {
          readBy: [...m.readBy, email],
          status: "read",
          readAt,
        },
      }),
    ),
  );

  emitMatchReceipt(req.params.id, {
    messageIds: pendingRead.map((m) => m.id),
    status: "read",
    actorEmail: email,
    at: readAt,
  });

  return res.json({ success: true, updated: pendingRead.length });
});
