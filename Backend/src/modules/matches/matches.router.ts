import { Router } from "express";
import { MatchStatus, MatchType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { applyEloAfterCompletedMatch } from "../../lib/applyEloAfterCompletedMatch.js";
import {
  balancePadelTeams,
  inferWinnerTeam,
  isDoublesStyle,
  teamsPartitionPlayers,
} from "../../lib/matchTeams.js";
import { effectiveTeamsAtStart, validateMatchStart } from "../../lib/matchStartValidator.js";
import { resolveEffectiveElo } from "../../lib/elo.js";
import { emitMatchMessage, emitMatchReceipt } from "../../lib/socket.js";

export const matchesRouter = Router();

async function getHostEmail(match: { hostId: string | null }): Promise<string | null> {
  if (!match.hostId) return null;
  const u = await prisma.user.findUnique({
    where: { id: match.hostId },
    select: { email: true },
  });
  return u?.email ?? null;
}

function emailsEqual(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

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
      confirmedPlayerEmails: body.createdByEmail ? [body.createdByEmail] : [],
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
  const hostEmail = await getHostEmail(match);
  return res.json({ ...match, hostEmail });
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
  const confirmedPlayerEmails = match.confirmedPlayerEmails.includes(email)
    ? match.confirmedPlayerEmails
    : [...match.confirmedPlayerEmails, email];
  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: {
      players,
      confirmedPlayerEmails,
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
  const confirmedPlayerEmails = match.confirmedPlayerEmails.filter((e) => e !== email);
  let teamsLocked = match.teamsLocked;
  if (match.teamA.includes(email) || match.teamB.includes(email)) {
    teamsLocked = false;
  }
  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: {
      players,
      confirmedPlayerEmails,
      teamA: match.teamA.filter((p) => p !== email),
      teamB: match.teamB.filter((p) => p !== email),
      teamsLocked,
      status: players.length >= match.maxPlayers ? MatchStatus.full : MatchStatus.open,
    },
  });
  return res.json(updated);
});

matchesRouter.post("/:id/confirm", async (req, res) => {
  const email = String(req.body.email || "");
  if (!email) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (!match.players.includes(email)) {
    return res.status(400).json({ error: "Only listed players can confirm attendance" });
  }
  if (match.confirmedPlayerEmails.includes(email)) return res.json(match);
  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: { confirmedPlayerEmails: [...match.confirmedPlayerEmails, email] },
  });
  return res.json(updated);
});

matchesRouter.post("/:id/teams", async (req, res) => {
  const actor = String(req.body.email || "");
  const { teamA, teamB } = req.body as { teamA?: string[]; teamB?: string[] };
  if (!actor) return res.status(400).json({ error: "email is required" });
  if (!Array.isArray(teamA) || !Array.isArray(teamB)) {
    return res.status(400).json({ error: "teamA and teamB arrays are required" });
  }
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
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
  return res.json(updated);
});

matchesRouter.post("/:id/balance-teams", async (req, res) => {
  const actor = String(req.body.email || "");
  if (!actor) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
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
  const eloByEmail: Record<string, number> = {};
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
  return res.json(updated);
});

matchesRouter.post("/:id/lock-teams", async (req, res) => {
  const actor = String(req.body.email || "");
  if (!actor) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
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
  return res.json(updated);
});

matchesRouter.post("/:id/unlock-teams", async (req, res) => {
  const actor = String(req.body.email || "");
  if (!actor) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
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
  return res.json(updated);
});

matchesRouter.post("/:id/start", async (req, res) => {
  const actor = String(req.body.email || "").trim();
  if (!actor) return res.status(400).json({ error: "email is required" });

  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.status !== MatchStatus.open && match.status !== MatchStatus.full) {
    return res.status(409).json({ error: "Match cannot be started from current status" });
  }

  const hostEmail = await getHostEmail(match);
  if (!hostEmail || !emailsEqual(actor, hostEmail)) {
    return res.status(403).json({ error: "Only the organiser can start the match" });
  }

  const startCheck = validateMatchStart(match);
  if (!startCheck.valid) {
    return res.status(400).json({ error: startCheck.reason });
  }

  const { teamA, teamB } = effectiveTeamsAtStart(match);

  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: {
      status: MatchStatus.in_progress,
      teamA,
      teamB,
    },
  });
  return res.json(updated);
});

matchesRouter.post("/:id/submit-score", async (req, res) => {
  const {
    scoreTeamA,
    scoreTeamB,
    winnerTeam,
    submittedBy,
    email,
  } = req.body as Partial<{
    scoreTeamA: string;
    scoreTeamB: string;
    winnerTeam: string;
    submittedBy: string;
    email: string;
  }>;

  const actor = String(submittedBy || email || "").trim();
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.status === MatchStatus.completed) {
    return res.json(match);
  }

  if (!scoreTeamA?.trim() || !scoreTeamB?.trim()) {
    return res.status(400).json({ error: "scoreTeamA and scoreTeamB are required" });
  }

  const hostEmail = await getHostEmail(match);
  const inferred = inferWinnerTeam(scoreTeamA, scoreTeamB);
  const resolvedWinner = (winnerTeam || inferred || "").trim() || null;
  const winnerNorm = resolvedWinner
    ? resolvedWinner.toLowerCase().replace(/[\s-]+/g, "_")
    : null;
  const wTeam =
    winnerNorm === "team_a" || winnerNorm === "teama"
      ? "team_a"
      : winnerNorm === "team_b" || winnerNorm === "teamb"
        ? "team_b"
        : null;

  const finalize = async () => {
    if (!wTeam) {
      return res.status(400).json({ error: "winnerTeam could not be determined; set it explicitly" });
    }
    const updated = await prisma.match.update({
      where: { id: req.params.id },
      data: {
        scoreTeamA,
        scoreTeamB,
        winnerTeam: wTeam,
        status: MatchStatus.completed,
        scoreConfirmedBy: hostEmail && actor && emailsEqual(actor, hostEmail) ? actor : null,
        pendingScoreTeamA: null,
        pendingScoreTeamB: null,
        pendingWinnerTeam: null,
        scoreSubmittedBy: null,
      },
    });
    try {
      await applyEloAfterCompletedMatch(updated);
    } catch (err) {
      console.error("[elo] applyEloAfterCompletedMatch failed:", err);
    }
    return res.json(updated);
  };

  // Legacy clients (no actor): complete immediately
  if (!actor) {
    return await finalize();
  }

  const isHost = Boolean(hostEmail && emailsEqual(actor, hostEmail));

  if (isHost || !hostEmail) {
    return await finalize();
  }

  // Participant proposal → organiser confirms (Base44-style)
  if (match.status !== MatchStatus.in_progress) {
    return res.status(409).json({ error: "Scores can only be proposed while the match is in progress" });
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
      status: MatchStatus.awaiting_score,
    },
  });
  return res.json(updated);
});

matchesRouter.post("/:id/confirm-score", async (req, res) => {
  const actor = String(req.body.email || "");
  if (!actor) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.status !== MatchStatus.awaiting_score) {
    return res.status(409).json({ error: "No pending score to confirm" });
  }
  const hostEmail = await getHostEmail(match);
  if (!hostEmail || !emailsEqual(actor, hostEmail)) {
    return res.status(403).json({ error: "Only the organiser can confirm the score" });
  }
  const w =
    match.pendingWinnerTeam ||
    inferWinnerTeam(match.pendingScoreTeamA || "", match.pendingScoreTeamB || "");
  if (!w) {
    return res.status(400).json({ error: "Invalid pending scores" });
  }
  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: {
      scoreTeamA: match.pendingScoreTeamA,
      scoreTeamB: match.pendingScoreTeamB,
      winnerTeam: w,
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
  } catch (err) {
    console.error("[elo] applyEloAfterCompletedMatch failed:", err);
  }
  return res.json(updated);
});

matchesRouter.post("/:id/reject-score", async (req, res) => {
  const actor = String(req.body.email || "");
  if (!actor) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  const hostEmail = await getHostEmail(match);
  if (!hostEmail || !emailsEqual(actor, hostEmail)) {
    return res.status(403).json({ error: "Only the organiser can reject a proposed score" });
  }
  if (match.status !== MatchStatus.awaiting_score) {
    return res.status(409).json({ error: "No pending score to reject" });
  }
  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: {
      pendingScoreTeamA: null,
      pendingScoreTeamB: null,
      pendingWinnerTeam: null,
      scoreSubmittedBy: null,
      status: MatchStatus.in_progress,
    },
  });
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
