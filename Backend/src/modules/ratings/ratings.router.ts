import { Router } from "express";
import { MatchStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export const ratingsRouter = Router();

async function syncUserAverageRating(ratedEmail: string) {
  const agg = await prisma.rating.aggregate({
    where: { ratedEmail },
    _avg: { overall: true },
  });
  const avg = agg._avg.overall;
  await prisma.user.update({
    where: { email: ratedEmail },
    data: { averageRating: avg != null ? Math.round(avg * 10) / 10 : null },
  });
}

ratingsRouter.post("/match", async (req, res) => {
  const matchId = String(req.body.matchId || "");
  const raterEmail = String(req.body.raterEmail || "").trim().toLowerCase();
  const items = req.body.ratings as
    | { ratedEmail: string; overall: number; comment?: string }[]
    | undefined;

  if (!matchId || !raterEmail || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "matchId, raterEmail and ratings[] are required" });
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return res.status(404).json({ error: "Match not found" });
  if (match.status !== MatchStatus.completed) {
    return res.status(409).json({ error: "Ratings are only allowed after the match is completed" });
  }
  if (!match.players.map((e) => e.toLowerCase()).includes(raterEmail)) {
    return res.status(403).json({ error: "Only match participants can leave ratings" });
  }

  const raterCanonical = match.players.find((e) => e.toLowerCase() === raterEmail)!;

  const rater = await prisma.user.findUnique({
    where: { email: raterCanonical },
    select: { id: true },
  });
  if (!rater) return res.status(404).json({ error: "Rater not found" });

  const playerSet = new Map(match.players.map((e) => [e.toLowerCase(), e]));

  for (const row of items) {
    const ratedKey = String(row.ratedEmail || "").trim().toLowerCase();
    const ratedCanonical = playerSet.get(ratedKey);
    if (!ratedCanonical || ratedCanonical.toLowerCase() === raterCanonical.toLowerCase()) continue;
    const overall = Math.round(Number(row.overall));
    if (overall < 1 || overall > 5) {
      return res.status(400).json({ error: "Each rating overall must be 1–5" });
    }

    const rated = await prisma.user.findUnique({
      where: { email: ratedCanonical },
      select: { id: true },
    });

    const existing = await prisma.rating.findFirst({
      where: { matchId, raterEmail: raterCanonical, ratedEmail: ratedCanonical },
    });

    if (existing) {
      await prisma.rating.update({
        where: { id: existing.id },
        data: { overall, comment: row.comment?.trim() || null },
      });
    } else {
      await prisma.rating.create({
        data: {
          matchId,
          raterEmail: raterCanonical,
          ratedEmail: ratedCanonical,
          raterId: rater.id,
          ratedId: rated?.id ?? undefined,
          overall,
          comment: row.comment?.trim() || undefined,
        },
      });
    }

    await syncUserAverageRating(ratedCanonical);
  }

  return res.json({ ok: true });
});

ratingsRouter.get("/match/:matchId", async (req, res) => {
  const raterEmail = String(req.query.raterEmail || "").trim().toLowerCase();
  if (!raterEmail) return res.status(400).json({ error: "raterEmail query is required" });

  const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
  const raterCanonical = match?.players.find((e) => e.toLowerCase() === raterEmail);
  if (!match || !raterCanonical) {
    return res.json([]);
  }

  const rows = await prisma.rating.findMany({
    where: { matchId: req.params.matchId, raterEmail: raterCanonical },
    select: { ratedEmail: true, overall: true, comment: true },
  });
  res.json(rows);
});
