import { Router } from "express";
import { MatchStatus, MatchType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { applyEloAfterCompletedMatch } from "../../lib/applyEloAfterCompletedMatch.js";
import {
  balancePadelTeams,
  inferWinnerTeam,
  isDoublesStyle,
  teamsPartitionPlayers,
  effectiveTeamsAtStart,
} from "../../lib/matchTeams.js";
import { validateMatchStart } from "../../lib/matchStartValidator.js";
import {
  playerMeetsMatchEligibility,
  userToEligibilityProfile,
  stubProfileForEmail,
  type MatchEligibilityProfile,
} from "../../lib/matchEligibility.js";
import { resolveEffectiveElo } from "../../lib/elo.js";
import { emitMatchMessage, emitMatchReceipt } from "../../lib/socket.js";
import { notifyMatchEmails, notifyUser } from "../../lib/matchNotifications.js";

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

function playersIncludesCi(players: string[], email: string): boolean {
  return players.some((p) => emailsEqual(p, email));
}

function matchStartDateTime(match: { date: Date; timeLabel: string }): Date {
  const dt = new Date(match.date);
  const parts = match.timeLabel.split(":");
  const h = Number.parseInt(parts[0] || "0", 10);
  const m = Number.parseInt(parts[1] || "0", 10);
  dt.setHours(h, m, 0, 0);
  return dt;
}

async function rosterProfileMap(
  playerEmails: string[],
): Promise<Map<string, MatchEligibilityProfile>> {
  if (!playerEmails.length) return new Map();
  const users = await prisma.user.findMany({
    where: {
      OR: playerEmails.map((e) => ({
        email: { equals: e, mode: "insensitive" as const },
      })),
    },
  });
  const map = new Map<string, MatchEligibilityProfile>();
  for (const u of users) {
    map.set(u.email.trim().toLowerCase(), userToEligibilityProfile(u));
  }
  return map;
}

async function withHostJson(match: Parameters<typeof getHostEmail>[0] & { id: string }) {
  const hostEmail = await getHostEmail(match);
  return { ...match, hostEmail };
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
    genderRequirement: string;
    ageMin: number;
    ageMax: number;
    skillRangeMin: number;
    skillRangeMax: number;
    minRatingThreshold: number;
    verificationRequirement: string;
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
      genderRequirement: body.genderRequirement ?? "any",
      ageMin: typeof body.ageMin === "number" ? body.ageMin : undefined,
      ageMax: typeof body.ageMax === "number" ? body.ageMax : undefined,
      skillRangeMin: typeof body.skillRangeMin === "number" ? body.skillRangeMin : undefined,
      skillRangeMax: typeof body.skillRangeMax === "number" ? body.skillRangeMax : undefined,
      minRatingThreshold: typeof body.minRatingThreshold === "number" ? body.minRatingThreshold : undefined,
      verificationRequirement: body.verificationRequirement ?? "none",
    },
  });
  return res.status(201).json(await withHostJson(created));
});

matchesRouter.get("/:id", async (req, res) => {
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  const hostEmail = await getHostEmail(match);
  return res.json({ ...match, hostEmail });
});

matchesRouter.post("/:id/join", async (req, res) => {
  const email = String(req.body.email || "").trim();
  const team = req.body.team as "a" | "b" | undefined;
  if (!email) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.status === MatchStatus.cancelled) {
    return res.status(409).json({ error: "Match was cancelled" });
  }
  if (match.visibility === "invite_only") {
    const hostEmail = await getHostEmail(match);
    const allowed =
      (hostEmail && emailsEqual(hostEmail, email)) ||
      match.invitedEmails.some((e) => emailsEqual(e, email)) ||
      playersIncludesCi(match.players, email);
    if (!allowed) {
      return res.status(403).json({ error: "This match is invite-only" });
    }
  }
  if (playersIncludesCi(match.players, email)) {
    const m = await prisma.match.findUnique({ where: { id: req.params.id } });
    return res.json(await withHostJson(m!));
  }
  if (match.players.length >= match.maxPlayers) {
    return res.status(409).json({ error: "Match is full" });
  }

  const joiner = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  const prof = joiner ? userToEligibilityProfile(joiner) : stubProfileForEmail(email);
  const elig = playerMeetsMatchEligibility(match, prof);
  if (!elig.ok) {
    return res.status(403).json({ error: elig.reason });
  }

  let teamA = [...match.teamA];
  let teamB = [...match.teamB];
  if (isDoublesStyle(match) && !match.teamsLocked && match.maxPlayers >= 4) {
    if (team !== "a" && team !== "b") {
      return res.status(400).json({ error: "Choose team A or B for this doubles match" });
    }
    if (team === "a") teamA = [...teamA, email];
    else teamB = [...teamB, email];
  }

  const players = [...match.players, email];
  const confirmedPlayerEmails = match.confirmedPlayerEmails.some((e) => emailsEqual(e, email))
    ? match.confirmedPlayerEmails
    : [...match.confirmedPlayerEmails, email];
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
  return res.json(await withHostJson(updated));
});

matchesRouter.post("/:id/leave", async (req, res) => {
  const email = String(req.body.email || "").trim();
  if (!email) return res.status(400).json({ error: "email is required" });

  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
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
    const recipients = match.players.filter(
      (p) => !emailsEqual(p, email) && !emailsEqual(p, hostEmailLeave),
    );
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
  if (!email) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.status === MatchStatus.cancelled) {
    return res.status(409).json({ error: "Match was cancelled" });
  }
  if (!playersIncludesCi(match.players, email)) {
    return res.status(400).json({ error: "Only listed players can confirm attendance" });
  }
  if (match.confirmedPlayerEmails.some((e) => emailsEqual(e, email))) {
    return res.json(await withHostJson(match));
  }
  const updated = await prisma.match.update({
    where: { id: req.params.id },
    data: { confirmedPlayerEmails: [...match.confirmedPlayerEmails, email] },
  });
  return res.json(await withHostJson(updated));
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
  if (!actor) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
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
  return res.json(await withHostJson(updated));
});

matchesRouter.post("/:id/lock-teams", async (req, res) => {
  const actor = String(req.body.email || "");
  if (!actor) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
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
  if (!actor) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
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
  if (!actor) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
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

  const rosterProfiles = await rosterProfileMap(match.players);
  const startCheck = validateMatchStart(match, rosterProfiles);
  if (!startCheck.valid) {
    return res.status(400).json({ error: startCheck.reason });
  }

  const { teamA, teamB } = effectiveTeamsAtStart(match);
  let teamACaptainEmail = match.teamACaptainEmail;
  let teamBCaptainEmail = match.teamBCaptainEmail;
  if (isDoublesStyle(match) && match.players.length >= 4) {
    if (!teamACaptainEmail) teamACaptainEmail = teamA[0] ?? null;
    if (!teamBCaptainEmail) teamBCaptainEmail = teamB[0] ?? null;
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
  if (match.status === MatchStatus.cancelled) {
    return res.status(409).json({ error: "Match was cancelled" });
  }
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
      status: MatchStatus.pending_validation,
    },
  });
  const hostN = await getHostEmail(match);
  const toAlert = new Set<string>();
  if (hostN && !emailsEqual(hostN, actor)) toAlert.add(hostN);
  for (const p of match.players) {
    if (!emailsEqual(p, actor)) toAlert.add(p.trim());
  }
  await notifyMatchEmails([...toAlert], {
    type: "match_score_pending",
    title: "Score proposed",
    body: `${actor} submitted a result for "${match.title}". Confirm or reject in the match.`,
    matchId: match.id,
  });
  return res.json(await withHostJson(updated));
});

matchesRouter.post("/:id/confirm-score", async (req, res) => {
  const actor = String(req.body.email || "");
  if (!actor) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (
    match.status !== MatchStatus.awaiting_score &&
    match.status !== MatchStatus.pending_validation
  ) {
    return res.status(409).json({ error: "No pending score to confirm" });
  }
  const submitter = match.scoreSubmittedBy;
  if (!submitter?.trim()) {
    return res.status(400).json({ error: "No score submitter recorded" });
  }
  if (emailsEqual(actor, submitter)) {
    return res.status(403).json({ error: "You cannot confirm your own score submission" });
  }
  const hostEmail = await getHostEmail(match);
  const isHost = Boolean(hostEmail && emailsEqual(actor, hostEmail));
  const isPlayer = playersIncludesCi(match.players, actor);
  if (!isHost && !isPlayer) {
    return res.status(403).json({ error: "Only the organiser or a match participant can confirm" });
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
  if (!actor) return res.status(400).json({ error: "email is required" });
  const match = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (
    match.status !== MatchStatus.awaiting_score &&
    match.status !== MatchStatus.pending_validation
  ) {
    return res.status(409).json({ error: "No pending score to reject" });
  }
  const submitter = match.scoreSubmittedBy;
  if (!submitter?.trim()) {
    return res.status(400).json({ error: "No score submitter recorded" });
  }
  if (emailsEqual(actor, submitter)) {
    return res.status(403).json({ error: "You cannot reject your own submission" });
  }
  const hostEmail = await getHostEmail(match);
  const isHost = Boolean(hostEmail && emailsEqual(actor, hostEmail));
  const isPlayer = playersIncludesCi(match.players, actor);
  if (!isHost && !isPlayer) {
    return res.status(403).json({ error: "Only the organiser or a match participant can reject" });
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
  await notifyUser({
    userEmail: submitter.trim(),
    type: "match_score_rejected",
    title: "Score not accepted",
    body: `Your proposed score for "${match.title}" was rejected. Submit again after agreement.`,
    matchId: match.id,
  });
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
