/**
 * Demo data: 4 users with full profiles, rich match history, competition, notifications, etc.
 *
 * Run from Backend/:
 *   npx prisma migrate deploy   # if your DB is missing columns (e.g. Match.country)
 *   npx prisma db seed
 *
 * Log in (local auth) with any user:
 *   Email:    demo.alex@padelme.demo  (or bella / chris / dana)
 *   Password: Demo1234!
 */

import {
  PrismaClient,
  MatchStatus,
  MatchType,
  CompetitionType,
  CompetitionFormat,
  CompetitionStatus,
} from "@prisma/client";
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
  averageRating: 4.6 as number | null,
};

/** Aggregate stats after seed matches (completed only). */
const STATS_BY_EMAIL: Record<
  string,
  { elo: number; peak: number; played: number; won: number; lost: number; streak: number }
> = {
  [DEMO_EMAIL.alex]: { elo: 1008, peak: 1015, played: 3, won: 2, lost: 1, streak: 1 },
  [DEMO_EMAIL.bella]: { elo: 1002, peak: 1012, played: 2, won: 1, lost: 1, streak: 0 },
  [DEMO_EMAIL.chris]: { elo: 998, peak: 1005, played: 3, won: 1, lost: 2, streak: 0 },
  [DEMO_EMAIL.dana]: { elo: 994, peak: 1000, played: 2, won: 1, lost: 1, streak: 0 },
};

async function wipeDemoData(demoEmailList: string[]) {
  const demoMatches = await prisma.match.findMany({
    where: {
      OR: [{ title: { startsWith: "[DEMO]" } }, ...demoEmailList.map((e) => ({ players: { has: e } }))],
    },
    select: { id: true },
  });
  const matchIds = demoMatches.map((m) => m.id);

  await prisma.chatMessage.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.rating.deleteMany({
    where: {
      OR: [{ raterEmail: { in: demoEmailList } }, { ratedEmail: { in: demoEmailList } }],
    },
  });
  await prisma.notification.deleteMany({ where: { userEmail: { in: demoEmailList } } });
  await prisma.friendRequest.deleteMany({
    where: {
      OR: [
        { requesterEmail: { in: demoEmailList } },
        { recipientEmail: { in: demoEmailList } },
      ],
    },
  });
  await prisma.playerRatingSummary.deleteMany({ where: { userEmail: { in: demoEmailList } } });
  await prisma.instantPlayRequest.deleteMany({ where: { userEmail: { in: demoEmailList } } });

  const demoCompetitions = await prisma.competition.findMany({
    where: { OR: [{ name: { startsWith: "[DEMO]" } }, { hostEmail: { in: demoEmailList } }] },
    select: { id: true },
  });
  const compIds = demoCompetitions.map((c) => c.id);
  if (compIds.length) {
    await prisma.groupStandings.deleteMany({ where: { competitionId: { in: compIds } } });
    await prisma.competition.deleteMany({ where: { id: { in: compIds } } });
  }

  await prisma.playerRecentForm.deleteMany({ where: { userEmail: { in: demoEmailList } } });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.playerStats.deleteMany({ where: { userEmail: { in: demoEmailList } } });
  await prisma.user.deleteMany({ where: { email: { in: demoEmailList } } });
}

async function main() {
  const passwordHash = await bcrypt.hash("Demo1234!", 10);
  const demoEmailList = Object.values(DEMO_EMAIL);

  await wipeDemoData(demoEmailList);

  const createdIds: Record<string, string> = {};
  const { alex: eAlex, bella: eBella, chris: eChris, dana: eDana } = DEMO_EMAIL;

  for (const p of PLAYERS) {
    const stats = STATS_BY_EMAIL[p.email];
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
        eloRating: stats.elo,
        matchHistory: [
          { title: "Stratford Winter Cup", result: "entered", date: "2026-01" },
          { title: "London Bridge ladder", result: "active", date: "2026-05" },
        ] as object[],
      },
    });
    createdIds[p.key] = user.id;

    await prisma.playerStats.create({
      data: {
        userId: user.id,
        userEmail: p.email,
        eloRating: stats.elo,
        eloPeak: stats.peak,
        matchesPlayed: stats.played,
        matchesWon: stats.won,
        matchesLost: stats.lost,
        matchWinPct: stats.played
          ? Math.round((100 * stats.won) / stats.played)
          : 0,
        currentWinStreak: stats.streak,
        bestWinStreak: 2,
        gamesWon: 24,
        gamesLost: 19,
        setsWon: 11,
        setsLost: 9,
        skillLabel: p.skillLabel,
        lastMatchAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });
  }

  const alexId = createdIds.alex!;
  const chrisId = createdIds.chris!;

  const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const past5 = days(5);
  const past12 = days(12);
  const past18 = days(18);
  const soon = new Date(Date.now() - 1 * 60 * 60 * 1000);

  const matchFriday = await prisma.match.create({
    data: {
      title: "[DEMO] Friday Night Doubles — Court 3",
      date: past5,
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
      scoreConfirmedBy: eBella,
      scoreSubmittedBy: eAlex,
      tags: ["🔥 Competitive", "🤝 Social"],
      notes: "SEED: Team A (Alex & Bella) won in three sets.",
    },
  });

  const matchSingles = await prisma.match.create({
    data: {
      title: "[DEMO] Morning Singles — tie-break thriller",
      date: past12,
      timeLabel: "08:30",
      durationMinutes: 60,
      locationName: "Queens Club Padel Pop-up",
      locationAddress: "Palliser Rd, London",
      locationLat: 51.4875,
      locationLng: -0.2112,
      country: "United Kingdom",
      skillLevel: "intermediate",
      maxPlayers: 2,
      matchType: MatchType.singles,
      status: MatchStatus.completed,
      visibility: "public",
      hostId: alexId,
      players: [eAlex, eChris],
      confirmedPlayerEmails: [eAlex, eChris],
      teamA: [eAlex],
      teamB: [eChris],
      teamACaptainEmail: eAlex,
      teamBCaptainEmail: eChris,
      teamsLocked: true,
      scoreTeamA: "7-6, 4-6, 7-6",
      scoreTeamB: "6-7, 6-4, 6-7",
      winnerTeam: "team_b",
      winnerEmail: eChris,
      scoreConfirmedBy: eAlex,
      scoreSubmittedBy: eChris,
      tags: ["🔥 Competitive"],
      notes: "SEED: Chris edges Alex in a third-set tie-break.",
    },
  });

  const matchLeagueNight = await prisma.match.create({
    data: {
      title: "[DEMO] League Night — Bella & Chris vs Alex & Dana",
      date: past18,
      timeLabel: "20:15",
      durationMinutes: 90,
      locationName: "Stratford Padel Hub",
      locationAddress: "Queen Elizabeth Olympic Park",
      locationLat: 51.5435,
      locationLng: -0.0167,
      country: "United Kingdom",
      skillLevel: "intermediate",
      maxPlayers: 4,
      matchType: MatchType.doubles,
      status: MatchStatus.completed,
      visibility: "public",
      hostId: chrisId,
      players: [eBella, eChris, eAlex, eDana],
      confirmedPlayerEmails: [eBella, eChris, eAlex, eDana],
      teamA: [eBella, eChris],
      teamB: [eAlex, eDana],
      teamACaptainEmail: eBella,
      teamBCaptainEmail: eAlex,
      teamsLocked: true,
      scoreTeamA: "2-6, 4-6",
      scoreTeamB: "6-2, 6-4",
      winnerTeam: "team_b",
      scoreConfirmedBy: eChris,
      scoreSubmittedBy: eDana,
      tags: ["🎯 Training"],
      notes: "SEED: Alex & Dana closed in straight sets.",
    },
  });

  await prisma.match.create({
    data: {
      title: "[DEMO] Rain check — dome maintenance",
      date: days(8),
      timeLabel: "17:00",
      durationMinutes: 90,
      locationName: "Canary Wharf Padel",
      locationAddress: "Montgomery Sq, London",
      locationLat: 51.5051,
      locationLng: -0.019,
      country: "United Kingdom",
      skillLevel: "any",
      maxPlayers: 4,
      matchType: MatchType.doubles,
      status: MatchStatus.cancelled,
      visibility: "public",
      hostId: alexId,
      players: [eAlex, eBella, eChris, eDana],
      confirmedPlayerEmails: [],
      teamA: [],
      teamB: [],
      teamsLocked: false,
      cancelledBy: eAlex,
      cancelledAt: days(8),
      tags: ["😎 Chill"],
      notes: "SEED: Cancelled — venue closed for maintenance.",
    },
  });

  await prisma.match.create({
    data: {
      title: "[DEMO] Social ladder — London Bridge (doubles)",
      date: days(-2),
      timeLabel: "18:00",
      durationMinutes: 90,
      locationName: "Padel Club London Bridge",
      locationAddress: "5 Tooley St, London",
      locationLat: 51.5055,
      locationLng: -0.0865,
      country: "United Kingdom",
      skillLevel: "intermediate",
      maxPlayers: 4,
      matchType: MatchType.doubles,
      status: MatchStatus.open,
      visibility: "public",
      hostId: alexId,
      players: [eAlex, eBella],
      confirmedPlayerEmails: [eAlex, eBella],
      teamA: [],
      teamB: [],
      teamsLocked: false,
      tags: ["🤝 Social"],
      notes: "SEED: Open game — join from Discover.",
    },
  });

  await prisma.match.create({
    data: {
      title: "[DEMO] Sunday fourball — roster full, not started",
      date: days(-1),
      timeLabel: "10:00",
      durationMinutes: 120,
      locationName: "Stratford Padel Hub",
      locationAddress: "Queen Elizabeth Olympic Park",
      locationLat: 51.5435,
      locationLng: -0.0167,
      country: "United Kingdom",
      skillLevel: "advanced",
      maxPlayers: 4,
      matchType: MatchType.doubles,
      status: MatchStatus.full,
      visibility: "public",
      hostId: chrisId,
      players: [eChris, eBella, eAlex, eDana],
      confirmedPlayerEmails: [eChris, eBella, eAlex, eDana],
      teamA: [],
      teamB: [],
      teamsLocked: false,
      tags: ["🔥 Competitive"],
      notes: "SEED: Organiser can assign teams, lock, then start.",
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
      notes: "SEED: Awaiting score — submit from Match detail.",
    },
  });

  /** Extra open fixtures for manual / QA testing (visible on Home & Discover). */
  const testWeekAhead = days(-7);
  await prisma.match.create({
    data: {
      title: "[DEMO] Test Singles Open (1/2)",
      date: testWeekAhead,
      timeLabel: "18:00",
      durationMinutes: 60,
      locationName: "Horsham Padel Centre (test)",
      locationAddress: "Horsham, United Kingdom",
      locationLat: 51.0629,
      locationLng: -0.3256,
      country: "United Kingdom",
      skillLevel: "intermediate",
      maxPlayers: 2,
      matchType: MatchType.singles,
      status: MatchStatus.open,
      visibility: "public",
      hostId: alexId,
      players: [eAlex],
      confirmedPlayerEmails: [eAlex],
      teamA: [],
      teamB: [],
      teamsLocked: false,
      tags: ["🌱 Beginner-friendly"],
      notes: "SEED: Test singles — host is Alex; one slot free.",
    },
  });

  await prisma.match.create({
    data: {
      title: "[DEMO] Test Doubles Open (1/4)",
      date: testWeekAhead,
      timeLabel: "18:30",
      durationMinutes: 90,
      locationName: "Sunderland Padel Club (test)",
      locationAddress: "Sunderland, United Kingdom",
      locationLat: 54.9069,
      locationLng: -1.3838,
      country: "United Kingdom",
      skillLevel: "intermediate",
      maxPlayers: 4,
      matchType: MatchType.doubles,
      status: MatchStatus.open,
      visibility: "public",
      hostId: alexId,
      players: [eAlex],
      confirmedPlayerEmails: [eAlex],
      teamA: [],
      teamB: [],
      teamsLocked: false,
      tags: ["🤝 Social"],
      notes: "SEED: Test doubles — host is Alex; three spots free.",
    },
  });

  const recentRows = [
    {
      userEmail: eAlex,
      matchId: matchFriday.id,
      matchTitle: "[DEMO] Friday Night Doubles — Court 3",
      matchDate: past5,
      eventType: "match",
      matchFormat: "doubles",
      result: "win",
      opponentEmails: [eChris, eDana],
      scoreSummary: "6-4, 4-6, 6-3",
      eloChange: 8,
      eloAfter: 1006,
    },
    {
      userEmail: eAlex,
      matchId: matchSingles.id,
      matchTitle: "[DEMO] Morning Singles — tie-break thriller",
      matchDate: past12,
      eventType: "match",
      matchFormat: "singles",
      result: "loss",
      opponentEmails: [eChris],
      scoreSummary: "7-6, 4-6, 7-6",
      eloChange: -6,
      eloAfter: 998,
    },
    {
      userEmail: eAlex,
      matchId: matchLeagueNight.id,
      matchTitle: "[DEMO] League Night — Bella & Chris vs Alex & Dana",
      matchDate: past18,
      eventType: "match",
      matchFormat: "doubles",
      result: "win",
      opponentEmails: [eBella, eChris],
      scoreSummary: "6-2, 6-4",
      eloChange: 10,
      eloAfter: 1008,
    },
    {
      userEmail: eBella,
      matchId: matchFriday.id,
      matchTitle: "[DEMO] Friday Night Doubles — Court 3",
      matchDate: past5,
      eventType: "match",
      matchFormat: "doubles",
      result: "win",
      opponentEmails: [eChris, eDana],
      scoreSummary: "6-4, 4-6, 6-3",
      eloChange: 8,
      eloAfter: 1003,
    },
    {
      userEmail: eBella,
      matchId: matchLeagueNight.id,
      matchTitle: "[DEMO] League Night — Bella & Chris vs Alex & Dana",
      matchDate: past18,
      eventType: "match",
      matchFormat: "doubles",
      result: "loss",
      opponentEmails: [eAlex, eDana],
      scoreSummary: "2-6, 4-6",
      eloChange: -5,
      eloAfter: 998,
    },
    {
      userEmail: eChris,
      matchId: matchFriday.id,
      matchTitle: "[DEMO] Friday Night Doubles — Court 3",
      matchDate: past5,
      eventType: "match",
      matchFormat: "doubles",
      result: "loss",
      opponentEmails: [eAlex, eBella],
      scoreSummary: "4-6, 6-4, 3-6",
      eloChange: -6,
      eloAfter: 997,
    },
    {
      userEmail: eChris,
      matchId: matchSingles.id,
      matchTitle: "[DEMO] Morning Singles — tie-break thriller",
      matchDate: past12,
      eventType: "match",
      matchFormat: "singles",
      result: "win",
      opponentEmails: [eAlex],
      scoreSummary: "6-7, 6-4, 7-6",
      eloChange: 9,
      eloAfter: 1004,
    },
    {
      userEmail: eChris,
      matchId: matchLeagueNight.id,
      matchTitle: "[DEMO] League Night — Bella & Chris vs Alex & Dana",
      matchDate: past18,
      eventType: "match",
      matchFormat: "doubles",
      result: "loss",
      opponentEmails: [eAlex, eDana],
      scoreSummary: "2-6, 4-6",
      eloChange: -4,
      eloAfter: 1000,
    },
    {
      userEmail: eDana,
      matchId: matchFriday.id,
      matchTitle: "[DEMO] Friday Night Doubles — Court 3",
      matchDate: past5,
      eventType: "match",
      matchFormat: "doubles",
      result: "loss",
      opponentEmails: [eAlex, eBella],
      scoreSummary: "4-6, 6-4, 3-6",
      eloChange: -6,
      eloAfter: 991,
    },
    {
      userEmail: eDana,
      matchId: matchLeagueNight.id,
      matchTitle: "[DEMO] League Night — Bella & Chris vs Alex & Dana",
      matchDate: past18,
      eventType: "match",
      matchFormat: "doubles",
      result: "win",
      opponentEmails: [eBella, eChris],
      scoreSummary: "6-2, 6-4",
      eloChange: 7,
      eloAfter: 998,
    },
  ];

  await prisma.playerRecentForm.createMany({ data: recentRows });

  const winterCup = await prisma.competition.create({
    data: {
      name: "[DEMO] Stratford Winter Cup 2026",
      description: "Round-robin among the demo crew — ladder points for bragging rights.",
      type: CompetitionType.league,
      format: CompetitionFormat.round_robin,
      status: CompetitionStatus.completed,
      visibility: "public",
      locationName: "Stratford Padel Hub",
      locationLat: 51.5435,
      locationLng: -0.0167,
      startDate: days(90),
      endDate: days(75),
      skillLevel: "intermediate",
      maxPlayers: 8,
      participants: [eAlex, eBella, eChris, eDana],
      hostEmail: eChris,
      numSets: 3,
      gamesPerSet: 6,
    },
  });

  await prisma.competitionMatch.createMany({
    data: [
      {
        competitionId: winterCup.id,
        round: 1,
        roundName: "Round 1",
        teamAEmails: [eAlex, eBella],
        teamBEmails: [eChris, eDana],
        winnerTeam: "team_a",
        status: "completed",
        scheduledDate: days(88),
        scheduledTime: "19:00",
        matchOrder: 1,
        statsUpdated: true,
      },
      {
        competitionId: winterCup.id,
        round: 1,
        roundName: "Round 1",
        player1Email: eAlex,
        player1Name: "Alex Rivera",
        player2Email: eDana,
        player2Name: "Dana Müller",
        winnerEmail: eAlex,
        status: "completed",
        scheduledDate: days(85),
        scheduledTime: "10:30",
        scorePlayer1: "6-3, 6-4",
        scorePlayer2: "3-6, 4-6",
        matchOrder: 2,
        statsUpdated: true,
      },
    ],
  });

  await prisma.groupStandings.createMany({
    data: [
      {
        competitionId: winterCup.id,
        userEmail: eAlex,
        playerName: "Alex Rivera",
        played: 2,
        won: 2,
        lost: 0,
        points: 6,
        gamesWon: 24,
        gamesLost: 14,
        setsWon: 4,
        setsLost: 1,
      },
      {
        competitionId: winterCup.id,
        userEmail: eBella,
        playerName: "Bella Chen",
        played: 1,
        won: 1,
        lost: 0,
        points: 3,
        gamesWon: 12,
        gamesLost: 9,
        setsWon: 2,
        setsLost: 0,
      },
      {
        competitionId: winterCup.id,
        userEmail: eChris,
        playerName: "Chris Okonkwo",
        played: 1,
        won: 0,
        lost: 1,
        points: 0,
        gamesWon: 9,
        gamesLost: 12,
        setsWon: 0,
        setsLost: 2,
      },
      {
        competitionId: winterCup.id,
        userEmail: eDana,
        playerName: "Dana Müller",
        played: 2,
        won: 0,
        lost: 2,
        points: 0,
        gamesWon: 16,
        gamesLost: 24,
        setsWon: 1,
        setsLost: 4,
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userEmail: eAlex,
        type: "match_reminder",
        title: "Match tomorrow",
        body: '[DEMO] Sunday fourball — roster full — tomorrow 10:00 at Stratford.',
        relatedEntityType: "match",
        priority: "normal",
      },
      {
        userEmail: eBella,
        type: "match_completed",
        title: "Score confirmed",
        body: "Your [DEMO] Friday Night Doubles result is final.",
        relatedEntityType: "match",
        matchId: matchFriday.id,
      },
      {
        userEmail: eChris,
        type: "match_awaiting_score",
        title: "Submit score",
        body: "[DEMO] Midweek Ladder is waiting for a score.",
        relatedEntityType: "match",
        priority: "high",
      },
      {
        userEmail: eDana,
        type: "friend_activity",
        title: "Ladder update",
        body: "Chris posted a new open game — tap Discover.",
        priority: "low",
      },
    ],
  });

  await prisma.rating.createMany({
    data: [
      {
        matchId: matchFriday.id,
        raterId: createdIds.bella,
        ratedId: createdIds.dana,
        raterEmail: eBella,
        ratedEmail: eDana,
        role: "opponent",
        overall: 5,
        tags: ["Good attitude", "Would play again"],
        comment: "Great energy at the net — thanks for the games!",
      },
      {
        matchId: matchSingles.id,
        raterId: createdIds.alex,
        ratedId: createdIds.chris,
        raterEmail: eAlex,
        ratedEmail: eChris,
        role: "opponent",
        overall: 5,
        tags: ["Skill accurate"],
        comment: "Unreal tie-break — rematch soon.",
      },
    ],
  });

  await prisma.chatMessage.createMany({
    data: [
      {
        matchId: matchFriday.id,
        senderEmail: eAlex,
        senderName: "Alex Rivera",
        text: "Court 3 booked under my name — see you at 6:50 for knock-up.",
      },
      {
        matchId: matchFriday.id,
        senderEmail: eBella,
        senderName: "Bella Chen",
        text: "Bringing new balls 🎾",
      },
      {
        matchId: matchFriday.id,
        senderEmail: eChris,
        senderName: "Chris Okonkwo",
        text: "On my way — traffic ok",
      },
    ],
  });

  await prisma.instantPlayRequest.create({
    data: {
      userEmail: eDana,
      userName: "Dana Müller",
      skillLevel: "intermediate",
      skillNumeric: 5,
      timeWindow: "evening",
      locationName: "Near Stratford",
      locationLat: 51.54,
      locationLng: -0.02,
      matchType: MatchType.doubles,
      status: "expired",
      expiresAt: days(10),
    },
  });

  await prisma.friendRequest.create({
    data: {
      requesterEmail: eBella,
      recipientEmail: eDana,
      status: "accepted",
    },
  });

  await prisma.playerRatingSummary.createMany({
    data: [
      {
        userId: createdIds.dana,
        userEmail: eDana,
        averageRating: 4.8,
        totalRatings: 3,
        tagGoodAttitudeCount: 2,
        tagWouldPlayAgainCount: 2,
        tagSkillAccurateCount: 1,
        tagReliableCount: 2,
      },
      {
        userId: createdIds.chris,
        userEmail: eChris,
        averageRating: 4.9,
        totalRatings: 4,
        tagSkillAccurateCount: 3,
        tagWouldPlayAgainCount: 3,
        tagGoodAttitudeCount: 2,
        tagReliableCount: 2,
      },
    ],
  });

  console.log("\n[DEMO] Seed complete (extended history, competition, notifications, chat, ratings).\n");
  console.log("Users (password: Demo1234!):");
  for (const p of PLAYERS) {
    console.log(`  • ${p.fullName}  <${p.email}>`);
  }
  console.log("\nMatches (titles start with [DEMO]):");
  console.log("  • Friday doubles — completed + score");
  console.log("  • Morning singles — Alex vs Chris, completed");
  console.log("  • League night doubles — completed");
  console.log("  • Rain check — cancelled");
  console.log("  • Social ladder — London Bridge, open (starts 2/4 in seed)");
  console.log("  • Sunday fourball — full, not started");
  console.log("  • Midweek ladder — awaiting score");
  console.log("  • Test singles open — Alex 1/2 (Horsham)");
  console.log("  • Test doubles open — Alex 1/4 (Sunderland)\n");
  console.log(`Competition: ${winterCup.name} (completed, standings + 2 box scores)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
