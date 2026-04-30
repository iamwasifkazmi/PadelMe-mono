import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export const usersRouter = Router();

usersRouter.get("/", async (req, res) => {
  const search = String(req.query.search || "").trim().toLowerCase();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const filtered = search
    ? users.filter((u) =>
        (u.fullName || u.email).toLowerCase().includes(search),
      )
    : users;
  res.json(filtered);
});

usersRouter.get("/me", async (req, res) => {
  const email = String(req.query.email || "");
  if (!email) return res.status(400).json({ error: "email query is required" });
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const baseName = email.split("@")[0] || "Player";
    const guessedName = baseName
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    user = await prisma.user.create({
      data: {
        email,
        fullName: guessedName || "Player",
        skillLabel: "intermediate",
      },
    });
  }
  return res.json(user);
});

usersRouter.patch("/me", async (req, res) => {
  const email = String(req.body.email || "");
  if (!email) return res.status(400).json({ error: "email is required" });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) return res.status(404).json({ error: "User not found" });

  const payload = req.body as Partial<{
    fullName: string;
    bio: string;
    location: string;
    skillLabel: string;
  }>;

  const updated = await prisma.user.update({
    where: { email },
    data: {
      fullName: payload.fullName ?? existing.fullName ?? undefined,
      bio: payload.bio ?? existing.bio ?? undefined,
      location: payload.location ?? existing.location ?? undefined,
      skillLabel: payload.skillLabel ?? existing.skillLabel ?? undefined,
    },
  });
  return res.json(updated);
});

usersRouter.get("/recent-results", async (req, res) => {
  const email = String(req.query.email || "").trim();
  if (!email) return res.status(400).json({ error: "email query is required" });

  const forms = await prisma.playerRecentForm.findMany({
    where: { userEmail: email },
    orderBy: { matchDate: "desc" },
    take: 12,
  });

  if (forms.length > 0) {
    return res.json(
      forms.map((f) => ({
        id: f.id,
        result: f.result === "win" || f.result === "W" ? "W" : "L",
        elo: f.eloChange ?? 0,
        date: f.matchDate ?? f.createdAt,
      })),
    );
  }

  const fallbackMatches = await prisma.match.findMany({
    where: {
      players: { has: email },
      status: { in: ["completed", "cancelled", "abandoned"] },
    },
    orderBy: { date: "desc" },
    take: 12,
  });

  return res.json(
    fallbackMatches.map((m) => ({
      id: m.id,
      result: m.status === "completed" ? "W" : "L",
      elo: m.status === "completed" ? 8 : -4,
      date: m.date,
    })),
  );
});

usersRouter.get("/:id", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(user);
});
