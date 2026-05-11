import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { distanceKmBetweenUsers } from "../../lib/geo.js";
import { resolveEffectiveElo } from "../../lib/elo.js";
import { emailsEqual } from "../../lib/emailsCi.js";
import { scheduledNonInstantSlotIsExpired } from "../../lib/matchSchedule.js";

export const usersRouter = Router();

function buildDisplayNameFromEmail(email: string) {
  const baseName = email.split("@")[0] || "Player";
  return (
    baseName
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Player"
  );
}

async function ensureUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  let user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: normalized,
        fullName: buildDisplayNameFromEmail(normalized),
        skillLabel: "intermediate",
      },
    });
  }
  return user;
}

usersRouter.get("/", async (req, res) => {
  const search = String(req.query.search || "").trim();
  const viewerEmail = String(req.query.viewerEmail || "").trim();
  const rawMaxDist = req.query.maxDistanceKm;
  let maxDistanceKm: number | undefined;
  if (rawMaxDist != null && String(rawMaxDist).trim() !== "") {
    const n = Number(rawMaxDist);
    if (!Number.isNaN(n) && n > 0) maxDistanceKm = n;
  }
  const gender = String(req.query.gender || "").trim().toLowerCase();
  const skillTier = String(req.query.skillTier || "").trim().toLowerCase();
  const country = String(req.query.country || "").trim();

  const viewer = viewerEmail
    ? await prisma.user.findUnique({
        where: { email: viewerEmail },
        select: { locationLat: true, locationLng: true },
      })
    : null;

  if (
    maxDistanceKm != null &&
    viewerEmail &&
    (viewer == null ||
      viewer.locationLat == null ||
      viewer.locationLng == null)
  ) {
    return res.json([]);
  }

  const where: Prisma.UserWhereInput = {};

  if (viewerEmail) {
    where.NOT = { email: { equals: viewerEmail, mode: "insensitive" } };
  }

  const andClauses: Prisma.UserWhereInput[] = [];

  if (search) {
    andClauses.push({
      OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (country) {
    andClauses.push({
      OR: [
        { country: { equals: country, mode: "insensitive" } },
        {
          AND: [
            { OR: [{ country: null }, { country: "" }] },
            {
              OR: [
                { locationName: { contains: country, mode: "insensitive" } },
                { location: { contains: country, mode: "insensitive" } },
              ],
            },
          ],
        },
      ],
    });
  }

  if (andClauses.length) {
    where.AND = andClauses;
  }

  if (gender === "male" || gender === "female") {
    where.gender = { equals: gender, mode: "insensitive" };
  }

  if (skillTier === "advanced") {
    where.skillLevel = { gte: 1, lte: 3 };
  } else if (skillTier === "intermediate") {
    where.skillLevel = { gte: 4, lte: 6 };
  } else if (skillTier === "beginner") {
    where.skillLevel = { gte: 7, lte: 10 };
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const statEmails = users.map((u) => u.email);
  const playerStatsRows = await prisma.playerStats.findMany({
    where: { userEmail: { in: statEmails } },
  });
  const statsByEmail = Object.fromEntries(
    playerStatsRows.map((s) => [s.userEmail, s]),
  );

  let withDistance = users.map((u) => {
    const ps = statsByEmail[u.email];
    const stored = ps?.eloRating ?? u.eloRating;
    const eloRating = resolveEffectiveElo(stored, ps?.lastMatchAt ?? null);
    return {
      ...u,
      eloRating,
      distanceKm: distanceKmBetweenUsers(
        viewer?.locationLat,
        viewer?.locationLng,
        u.locationLat,
        u.locationLng,
      ),
    };
  });

  if (
    maxDistanceKm != null &&
    viewer?.locationLat != null &&
    viewer?.locationLng != null
  ) {
    withDistance = withDistance.filter(
      (u) =>
        u.distanceKm != null &&
        !Number.isNaN(u.distanceKm) &&
        u.distanceKm <= maxDistanceKm,
    );
  }

  res.json(withDistance.slice(0, 100));
});

usersRouter.get("/me", async (req, res) => {
  const email = String(req.query.email || "");
  if (!email) return res.status(400).json({ error: "email query is required" });
  res.setHeader("Cache-Control", "private, no-store");
  const user = await ensureUserByEmail(email);
  const ps = await prisma.playerStats.findUnique({ where: { userId: user.id } });
  const stored = ps?.eloRating ?? user.eloRating;
  const eloRating = resolveEffectiveElo(stored, ps?.lastMatchAt ?? null);
  return res.json({ ...user, eloRating });
});

usersRouter.patch("/me", async (req, res) => {
  const email = String(req.body.email || "").trim();
  if (!email) return res.status(400).json({ error: "email is required" });
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (!existing) return res.status(404).json({ error: "User not found" });

  const payload = req.body as Partial<{
    fullName: string;
    bio: string;
    location: string | null;
    locationName: string | null;
    locationLat: number | null;
    locationLng: number | null;
    country: string | null;
    photoUrl: string;
    photoVerified: boolean;
    age: number | null;
    gender: string;
    skillLevel: number | null;
    skillLabel: string;
    skillConfidence: string;
    preferredPosition: string;
    availabilityDays: string[];
    availabilityTimes: string[];
    travelRadiusKm: number | null;
    useCurrentLocation: boolean;
    matchTypePreference: string;
    matchFormatPreference: string;
    tags: string[];
    profileVisibility: string;
    notifyInstantPlay: boolean;
    notifyNearbyMatches: boolean;
    notifyMatchInvites: boolean;
    notifyTournaments: boolean;
    profileComplete: boolean;
  }>;

  try {
    const data: Parameters<typeof prisma.user.update>[0]["data"] = {
      fullName: payload.fullName ?? existing.fullName ?? undefined,
      bio: payload.bio ?? existing.bio ?? undefined,
      photoUrl: payload.photoUrl ?? existing.photoUrl ?? undefined,
        photoVerified: payload.photoVerified ?? existing.photoVerified ?? undefined,
        age: payload.age ?? existing.age ?? undefined,
        gender: payload.gender ?? existing.gender ?? undefined,
        skillLevel: payload.skillLevel ?? existing.skillLevel ?? undefined,
        skillLabel: payload.skillLabel ?? existing.skillLabel ?? undefined,
        skillConfidence: payload.skillConfidence ?? existing.skillConfidence ?? undefined,
        preferredPosition: payload.preferredPosition ?? existing.preferredPosition ?? undefined,
        availabilityDays: payload.availabilityDays ?? existing.availabilityDays ?? undefined,
        availabilityTimes: payload.availabilityTimes ?? existing.availabilityTimes ?? undefined,
        travelRadiusKm: payload.travelRadiusKm ?? existing.travelRadiusKm ?? undefined,
        useCurrentLocation: payload.useCurrentLocation ?? existing.useCurrentLocation ?? undefined,
        matchTypePreference: payload.matchTypePreference ?? existing.matchTypePreference ?? undefined,
        matchFormatPreference: payload.matchFormatPreference ?? existing.matchFormatPreference ?? undefined,
        tags: payload.tags ?? existing.tags ?? undefined,
        profileVisibility: payload.profileVisibility ?? existing.profileVisibility ?? undefined,
        notifyInstantPlay: payload.notifyInstantPlay ?? existing.notifyInstantPlay ?? undefined,
        notifyNearbyMatches: payload.notifyNearbyMatches ?? existing.notifyNearbyMatches ?? undefined,
        notifyMatchInvites: payload.notifyMatchInvites ?? existing.notifyMatchInvites ?? undefined,
        notifyTournaments: payload.notifyTournaments ?? existing.notifyTournaments ?? undefined,
        profileComplete: payload.profileComplete ?? existing.profileComplete ?? undefined,
    };
    if ("location" in payload) data.location = payload.location ?? undefined;
    if ("locationName" in payload) data.locationName = payload.locationName ?? undefined;
    if ("locationLat" in payload) data.locationLat = payload.locationLat ?? undefined;
    if ("locationLng" in payload) data.locationLng = payload.locationLng ?? undefined;
    if ("country" in payload) data.country = payload.country?.trim() || null;

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data,
    });
    return res.json(updated);
  } catch (error) {
    // If DB schema is behind or a field payload is too large, fallback to legacy-safe update.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2022" || error.code === "P2000")
    ) {
      const fb: Parameters<typeof prisma.user.update>[0]["data"] = {
          fullName: payload.fullName ?? existing.fullName ?? undefined,
          bio: payload.bio ?? existing.bio ?? undefined,
          // In fallback mode we avoid writing potentially incompatible/oversized photo payloads.
          photoUrl:
            error.code === "P2000"
              ? existing.photoUrl ?? undefined
              : payload.photoUrl ?? existing.photoUrl ?? undefined,
          photoVerified: payload.photoVerified ?? existing.photoVerified ?? undefined,
          age: payload.age ?? existing.age ?? undefined,
          gender: payload.gender ?? existing.gender ?? undefined,
          skillLevel: payload.skillLevel ?? existing.skillLevel ?? undefined,
          skillLabel: payload.skillLabel ?? existing.skillLabel ?? undefined,
          profileVisibility: payload.profileVisibility ?? existing.profileVisibility ?? undefined,
          idVerified: existing.idVerified ?? undefined,
      };
      if ("location" in payload) fb.location = payload.location ?? undefined;
      if ("locationName" in payload) fb.locationName = payload.locationName ?? undefined;
      if ("locationLat" in payload) fb.locationLat = payload.locationLat ?? undefined;
      if ("locationLng" in payload) fb.locationLng = payload.locationLng ?? undefined;

      const fallback = await prisma.user.update({
        where: { id: existing.id },
        data: fb,
      });
      return res.json(fallback);
    }
    throw error;
  }
});

usersRouter.get("/recent-results", async (req, res) => {
  const emailRaw = String(req.query.email || "").trim();
  if (!emailRaw) return res.status(400).json({ error: "email query is required" });
  res.setHeader("Cache-Control", "private, no-store");
  const user = await ensureUserByEmail(emailRaw);
  const viewerEmail = user.email;

  const forms = await prisma.playerRecentForm.findMany({
    where: { userEmail: { equals: viewerEmail, mode: "insensitive" } },
    orderBy: { matchDate: "desc" },
    take: 12,
  });

  if (forms.length > 0) {
    return res.json(
      forms.map((f) => ({
        id: f.matchId,
        result: f.result === "win" || f.result === "W" ? "W" : "L",
        elo: f.eloChange ?? 0,
        date: f.matchDate ?? f.createdAt,
      })),
    );
  }

  const fallbackMatches = await prisma.match.findMany({
    where: {
      players: { has: viewerEmail },
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

usersRouter.get("/profile-summary", async (req, res) => {
  const emailParam = String(req.query.email || "").trim();
  if (!emailParam) return res.status(400).json({ error: "email query is required" });
  res.setHeader("Cache-Control", "private, no-store");

  const user = await ensureUserByEmail(emailParam);
  const viewerEmail = user.email;

  const [playerStats, myMatches, myCompetitions, recentForm, friendRequests] = await Promise.all([
    prisma.playerStats.findUnique({ where: { userId: user.id } }),
    prisma.match.findMany({
      where: { players: { has: viewerEmail } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 120,
    }),
    prisma.competition.findMany({
      where: {
        OR: [
          { participants: { has: viewerEmail } },
          { hostEmail: { equals: viewerEmail, mode: "insensitive" } },
        ],
      },
      orderBy: [{ endDate: "desc" }, { startDate: "desc" }, { createdAt: "desc" }],
      take: 80,
    }),
    prisma.playerRecentForm.findMany({
      where: { userEmail: { equals: viewerEmail, mode: "insensitive" } },
      orderBy: [{ matchDate: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
    prisma.friendRequest.findMany({
      where: {
        OR: [
          { requesterEmail: { equals: viewerEmail, mode: "insensitive" } },
          { recipientEmail: { equals: viewerEmail, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  const completedMatches = myMatches.filter((m) => m.status === "completed");
  const upcomingMatches = myMatches
    .filter((m) => {
      if (m.status !== "open" && m.status !== "full") return false;
      if (m.isInstant) return true;
      const d = m.date instanceof Date ? m.date : new Date(m.date);
      return !scheduledNonInstantSlotIsExpired({
        date: d,
        timeLabel: m.timeLabel,
        isInstant: false,
      });
    })
    .slice(0, 5)
    .map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date,
      locationName: m.locationName,
      status: m.status,
    }));

  const totalPlayed = playerStats?.matchesPlayed ?? completedMatches.length;
  const totalWins = playerStats?.matchesWon ?? 0;
  const totalLosses = playerStats?.matchesLost ?? 0;
  const winRate = totalPlayed > 0 ? Math.round((totalWins / totalPlayed) * 100) : 0;
  const storedElo = playerStats?.eloRating ?? user.eloRating ?? 1000;
  const eloRating = resolveEffectiveElo(storedElo, playerStats?.lastMatchAt ?? null);
  const eloPeak = playerStats?.eloPeak ?? Math.max(storedElo, 1000);

  const accepted = friendRequests.filter((r) => r.status === "accepted");
  const friendEmails = accepted.map((r) =>
    emailsEqual(r.requesterEmail, viewerEmail) ? r.recipientEmail : r.requesterEmail,
  );
  const friends = friendEmails.length
    ? await prisma.user.findMany({
        where: { email: { in: friendEmails } },
        orderBy: { updatedAt: "desc" },
        take: 6,
      })
    : [];

  const playedWithEmails = Array.from(
    new Set(
      completedMatches
        .flatMap((m) => m.players)
        .filter((participantEmail) => !emailsEqual(participantEmail, viewerEmail)),
    ),
  );
  const playedWith = playedWithEmails.length
    ? await prisma.user.findMany({
        where: { email: { in: playedWithEmails.slice(0, 20) } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      })
    : [];

  const matchHistoryItems = completedMatches.map((m) => {
    const onA = m.teamA.some((e) => emailsEqual(e, viewerEmail));
    const onB = m.teamB.some((e) => emailsEqual(e, viewerEmail));
    const myTeam = onA ? "teamA" : onB ? "teamB" : null;
    const result =
      m.winnerTeam && myTeam
        ? m.winnerTeam === myTeam
          ? "win"
          : "loss"
        : m.winnerEmail
          ? emailsEqual(m.winnerEmail, viewerEmail)
            ? "win"
            : "loss"
          : "played";
    const form = recentForm.find((f) => f.matchId === m.id);
    return {
      id: m.id,
      type: "match",
      title: m.title,
      date: m.date,
      result,
      scoreTeamA: m.scoreTeamA,
      scoreTeamB: m.scoreTeamB,
      eloChange: form?.eloChange ?? null,
      eloAfter: form?.eloAfter ?? null,
    };
  });

  const competitionHistoryItems = myCompetitions
    .filter((c) => c.status === "completed" || c.status === "cancelled")
    .map((c) => ({
      id: c.id,
      type: "competition",
      title: c.name,
      date: c.endDate || c.startDate || c.createdAt,
      result: c.status === "completed" ? "played" : "cancelled",
      competitionType: c.type,
    }));

  const recentHistory = [...matchHistoryItems, ...competitionHistoryItems]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);

  const recentFormDots = [...recentForm.slice(0, 5)]
    .reverse()
    .map((r) => (String(r.result || "").toLowerCase().startsWith("w") ? "W" : "L"));
  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const statusLine = user.availabilityDays.includes(todayName)
    ? "🟢 Available to play today"
    : "🎾 Looking for games";

  const averageRating = user.averageRating ?? 0;
  const achievements = [
    {
      key: "matches_10",
      icon: "🔥",
      label: "10 Matches",
      desc: "Played 10 matches",
      earned: totalPlayed >= 10,
    },
    {
      key: "wins_5",
      icon: "🏆",
      label: "5 Wins",
      desc: "Won 5 matches",
      earned: totalWins >= 5,
    },
    {
      key: "top_rated",
      icon: "⭐",
      label: "Top Rated",
      desc: "4.5+ rating",
      earned: averageRating >= 4.5,
    },
    {
      key: "verified",
      icon: "🛡️",
      label: "Verified",
      desc: "Identity verified",
      earned: user.idVerified,
    },
    {
      key: "high_elo",
      icon: "📈",
      label: "Rising Star",
      desc: "Reach 1100+ Elo rating",
      earned: eloRating >= 1100,
    },
  ];

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName || buildDisplayNameFromEmail(user.email),
      location: user.location,
      locationName: user.locationName,
      locationLat: user.locationLat,
      locationLng: user.locationLng,
      country: user.country,
      bio: user.bio,
      photoUrl: user.photoUrl,
      skillLabel: user.skillLabel || "intermediate",
      skillLevel: user.skillLevel,
      skillConfidence: user.skillConfidence,
      preferredPosition: user.preferredPosition,
      availabilityDays: user.availabilityDays,
      availabilityTimes: user.availabilityTimes,
      travelRadiusKm: user.travelRadiusKm,
      useCurrentLocation: user.useCurrentLocation,
      matchTypePreference: user.matchTypePreference,
      matchFormatPreference: user.matchFormatPreference,
      tags: user.tags,
      profileVisibility: user.profileVisibility,
      notifyInstantPlay: user.notifyInstantPlay,
      notifyNearbyMatches: user.notifyNearbyMatches,
      notifyMatchInvites: user.notifyMatchInvites,
      notifyTournaments: user.notifyTournaments,
      statusLine,
      averageRating: averageRating || null,
      eloRating,
      idVerified: user.idVerified,
      photoVerified: user.photoVerified,
      profileComplete: Boolean(
        user.profileComplete ||
          (user.bio &&
            user.locationLat != null &&
            user.locationLng != null &&
            !Number.isNaN(user.locationLat) &&
            !Number.isNaN(user.locationLng)),
      ),
    },
    stats: {
      matchesPlayed: totalPlayed,
      matchesWon: totalWins,
      matchesLost: totalLosses,
      winRate,
      eloRating,
      eloPeak,
    },
    recentFormDots,
    achievements,
    trustBadges: {
      idVerified: user.idVerified,
      photoVerified: user.photoVerified,
      topRated: averageRating >= 4.5,
      reliable: totalWins >= 5,
    },
    social: {
      friends: friends.map((f) => ({
        id: f.id,
        email: f.email,
        fullName: f.fullName || buildDisplayNameFromEmail(f.email),
        photoUrl: f.photoUrl,
      })),
      playedWith: playedWith.map((f) => ({
        id: f.id,
        email: f.email,
        fullName: f.fullName || buildDisplayNameFromEmail(f.email),
        photoUrl: f.photoUrl,
      })),
      friendCount: friendEmails.length,
    },
    upcomingMatches,
    recentHistory,
  });
});

usersRouter.get("/:id", async (req, res) => {
  const viewerEmail = String(req.query.viewerEmail || "").trim();
  const viewer = viewerEmail
    ? await prisma.user.findUnique({
        where: { email: viewerEmail },
        select: { locationLat: true, locationLng: true },
      })
    : null;

  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const ps = await prisma.playerStats.findUnique({ where: { userId: user.id } });
  const stored = ps?.eloRating ?? user.eloRating;
  const eloRating = resolveEffectiveElo(stored, ps?.lastMatchAt ?? null);
  const distanceKm = distanceKmBetweenUsers(
    viewer?.locationLat,
    viewer?.locationLng,
    user.locationLat,
    user.locationLng,
  );

  const matchesPlayed = ps?.matchesPlayed ?? 0;
  const matchesWon = ps?.matchesWon ?? 0;
  const matchesLost = ps?.matchesLost ?? 0;
  const winRatePct = matchesPlayed > 0 ? Math.round((matchesWon / matchesPlayed) * 100) : null;

  const recentFormRows = await prisma.playerRecentForm.findMany({
    where: { userEmail: user.email },
    orderBy: [{ matchDate: "desc" }, { createdAt: "desc" }],
    take: 12,
  });
  const recentMatchResults = recentFormRows.map((f) => ({
    matchId: f.matchId,
    title: f.matchTitle,
    date: (f.matchDate ?? f.createdAt).toISOString(),
    result: f.result,
    scoreSummary: f.scoreSummary ?? null,
  }));

  return res.json({
    ...user,
    eloRating,
    distanceKm,
    matchesPlayed,
    matchesWon,
    matchesLost,
    winRatePct,
    wins: matchesWon,
    recentMatchResults,
  });
});
