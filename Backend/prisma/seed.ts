/**
 * Demo data: 4 users with full profiles, doubles matches, and scores.
 *
 * Run from Backend/:  npx prisma db seed
 * Requires DATABASE_URL (and DIRECT_URL if you use it in schema).
 *
 * Log in (local auth) with any user:
 *   Email:    demo.alex@padelme.demo  (or bella / chris / dana)
 *   Password: Demo1234!
 */

import { PrismaClient, MatchStatus, MatchType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_EMAIL = {
  alex: "demo.alex@padelme.demo",
  bella: "demo.bella@padelme.demo",
  chris: "demo.chris@padelme.demo",
  dana: "demo.dana@padelme.demo",
} as const;

const PLAYERS = [
  {
    key: "alex",
    email: DEMO_EMAIL.alex,
    fullName: "Alex Rivera",
    gender: "male",
    age: 28,
    skillLevel: 5,
    skillLabel: "intermediate",
    skillConfidence: "medium",
    preferredPosition: "right",
    photoUrl: "https://i.pravatar.cc/300?u=padelme-alex",
    bio: "Competitive doubles player — love fast volleys and bandeja practice. Usually free weekday evenings.",
  },
  {
    key: "bella",
    email: DEMO_EMAIL.bella,
    fullName: "Bella Chen",
    gender: "female",
    age: 26,
    skillLevel: 4,
    skillLabel: "advanced",
    skillConfidence: "high",
    preferredPosition: "left",
    photoUrl: "https://i.pravatar.cc/300?u=padelme-bella",
    bio: "Padel for 3 years. Looking for solid partners for tournaments. Morning sessions are best.",
  },
  {
    key: "chris",
    email: DEMO_EMAIL.chris,
    fullName: "Chris Okonkwo",
    gender: "male",
    age: 32,
    skillLevel: 6,
    skillLabel: "intermediate",
    skillConfidence: "medium",
    preferredPosition: "both",
    photoUrl: "https://i.pravatar.cc/300?u=padelme-chris",
    bio: "Social-competitive — prefer long rallies and fair line calls. Based near Stratford.",
  },
  {
    key: "dana",
    email: DEMO_EMAIL.dana,
    fullName: "Dana Müller",
    gender: "female",
    age: 29,
    skillLevel: 5,
    skillLabel: "intermediate",
    skillConfidence: "low",
    preferredPosition: "right",
    photoUrl: "https://i.pravatar.cc/300?u=padelme-dana",
    bio: "Still learning the glass — patient partner appreciated. Free Tue/Thu/Sun.",
  },
] as const;

const SHARED_PROFILE = {
  country: "United Kingdom",
  location: "Padel Club London Bridge",
  locationName: "Padel Club London Bridge",
  locationLat: 51.5055,
  locationLng: -0.0865,
  availabilityDays: ["Tuesday", "Thursday", "Friday", "Saturday"],
  availabilityTimes: ["Evening", "Afternoon"],
  travelRadiusKm: 20,
  useCurrentLocation: false,
  matchTypePreference: "competitive",
  matchFormatPreference: "both",
  tags: ["Competitive", "Social"],
  profileVisibility: "public" as const,
  profileComplete: true,
  photoVerified: true,
  eloRating: 1000,
};

async function main() {
  const passwordHash = await bcrypt.hash("Demo1234!", 10);

  const demoEmailList = Object.values(DEMO_EMAIL);

  await prisma.playerRecentForm.deleteMany({
    where: { userEmail: { in: demoEmailList } },
  });
  await prisma.match.deleteMany({
    where: {
      OR: [
        { title: { startsWith: "[DEMO]" } },
        ...demoEmailList.map((e) => ({ players: { has: e } })),
      ],
    },
  });
  await prisma.playerStats.deleteMany({
    where: { userEmail: { in: demoEmailList } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: demoEmailList } },
  });

  const createdIds: Record<string, string> = {};

  for (const p of PLAYERS) {
    const user = await prisma.user.create({
      data: {
        email: p.email,
        fullName: p.fullName,
        passwordHash,
        authProvider: "local",
        isEmailVerified: true,
        gender: p.gender,
        age: p.age,
        skillLevel: p.skillLevel,
        skillLabel: p.skillLabel,
        skillConfidence: p.skillConfidence,
        preferredPosition: p.preferredPosition,
        bio: p.bio,
        photoUrl: p.photoUrl,
        ...SHARED_PROFILE,
        eloRating: p.key === "alex" || p.key === "bella" ? 1012 : 992,
      },
    });
    createdIds[p.key] = user.id;

    await prisma.playerStats.create({
      data: {
        userId: user.id,
        userEmail: p.email,
        eloRating: user.eloRating,
        eloPeak: user.eloRating,
        matchesPlayed: p.key === "alex" || p.key === "bella" ? 1 : 1,
        matchesWon: p.key === "alex" || p.key === "bella" ? 1 : 0,
        matchesLost: p.key === "alex" || p.key === "bella" ? 0 : 1,
        skillLabel: p.skillLabel,
        lastMatchAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    });
  }

  const alexId = createdIds.alex!;
  const { alex: eAlex, bella: eBella, chris: eChris, dana: eDana } = DEMO_EMAIL;

  const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const soon = new Date(Date.now() - 1 * 60 * 60 * 1000);

  const match1 = await prisma.match.create({
    data: {
      title: "[DEMO] Friday Night Doubles — Court 3",
      date: past,
      timeLabel: "19:00",
      durationMinutes: 90,
      locationName: "Padel Club London Bridge",
      locationAddress: "5 Tooley St, London",
      locationLat: 51.5055,
      locationLng: -0.0865,
      country: "United Kingdom",
      skillLevel: "intermediate",
      maxPlayers: 4,
      matchType: MatchType.doubles,
      status: MatchStatus.completed,
      visibility: "public",
      hostId: alexId,
      players: [eAlex, eBella, eChris, eDana],
      confirmedPlayerEmails: [eAlex, eBella, eChris, eDana],
      teamA: [eAlex, eBella],
      teamB: [eChris, eDana],
      teamACaptainEmail: eAlex,
      teamBCaptainEmail: eChris,
      teamsLocked: true,
      scoreTeamA: "6-4, 4-6, 6-3",
      scoreTeamB: "4-6, 6-4, 3-6",
      winnerTeam: "team_a",
      winnerEmail: null,
      scoreConfirmedBy: eBella,
      scoreSubmittedBy: eAlex,
      tags: ["🔥 Competitive", "🤝 Social"],
      notes: "SEED_DEMO: completed match with final score (Team A: Alex & Bella won).",
    },
  });

  await prisma.match.create({
    data: {
      title: "[DEMO] Midweek Ladder — enter score after play",
      date: soon,
      timeLabel: "12:30",
      durationMinutes: 90,
      locationName: "Stratford Padel Hub",
      locationAddress: "Queen Elizabeth Olympic Park",
      locationLat: 51.5435,
      locationLng: -0.0167,
      country: "United Kingdom",
      skillLevel: "intermediate",
      maxPlayers: 4,
      matchType: MatchType.doubles,
      status: MatchStatus.awaiting_score,
      visibility: "public",
      hostId: alexId,
      players: [eAlex, eBella, eChris, eDana],
      confirmedPlayerEmails: [eAlex, eBella, eChris, eDana],
      teamA: [eAlex, eBella],
      teamB: [eChris, eDana],
      teamACaptainEmail: eAlex,
      teamBCaptainEmail: eChris,
      teamsLocked: true,
      tags: ["🎯 Training"],
      notes: "SEED_DEMO: organiser marked ‘awaiting score’ — open app as any player to submit a score.",
    },
  });

  await prisma.playerRecentForm.createMany({
    data: [
      {
        userEmail: eAlex,
        matchId: match1.id,
        matchTitle: "[DEMO] Friday Night Doubles — Court 3",
        matchDate: past,
        eventType: "match",
        matchFormat: "doubles",
        result: "win",
        opponentEmails: [eChris, eDana],
        scoreSummary: "6-4, 4-6, 6-3",
        eloChange: 12,
        eloAfter: 1012,
      },
      {
        userEmail: eBella,
        matchId: match1.id,
        matchTitle: "[DEMO] Friday Night Doubles — Court 3",
        matchDate: past,
        eventType: "match",
        matchFormat: "doubles",
        result: "win",
        opponentEmails: [eChris, eDana],
        scoreSummary: "6-4, 4-6, 6-3",
        eloChange: 12,
        eloAfter: 1012,
      },
      {
        userEmail: eChris,
        matchId: match1.id,
        matchTitle: "[DEMO] Friday Night Doubles — Court 3",
        matchDate: past,
        eventType: "match",
        matchFormat: "doubles",
        result: "loss",
        opponentEmails: [eAlex, eBella],
        scoreSummary: "4-6, 6-4, 3-6",
        eloChange: -8,
        eloAfter: 992,
      },
      {
        userEmail: eDana,
        matchId: match1.id,
        matchTitle: "[DEMO] Friday Night Doubles — Court 3",
        matchDate: past,
        eventType: "match",
        matchFormat: "doubles",
        result: "loss",
        opponentEmails: [eAlex, eBella],
        scoreSummary: "4-6, 6-4, 3-6",
        eloChange: -8,
        eloAfter: 992,
      },
    ],
  });

  console.log("\n[DEMO] Seed complete.\n");
  console.log("Users (password: Demo1234!):");
  for (const p of PLAYERS) {
    console.log(`  • ${p.fullName}  <${p.email}>`);
  }
  console.log("\nMatches:");
  console.log("  • [DEMO] Friday Night Doubles — completed with score (Alex & Bella won).");
  console.log("  • [DEMO] Midweek Ladder — awaiting_score (try submitting score in the app).\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
