import type { Competition, CompetitionMatch, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type ParticipantSlot = {
  email: string;
  name: string;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function resolveParticipantSlots(
  emails: string[],
): Promise<ParticipantSlot[]> {
  const unique = [...new Set(emails.map((e) => e.trim()).filter(Boolean))];
  if (!unique.length) return [];

  const users = await prisma.user.findMany({
    where: {
      OR: unique.map((e) => ({
        email: { equals: e, mode: "insensitive" as const },
      })),
    },
    select: { email: true, fullName: true, firstName: true, lastName: true },
  });
  const byLower = new Map(users.map((u) => [u.email.toLowerCase(), u]));

  return unique.map((email) => {
    const u = byLower.get(email.toLowerCase());
    const name =
      u?.fullName?.trim() ||
      [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() ||
      email.split("@")[0].replaceAll(".", " ");
    return { email, name };
  });
}

function displayDoublesTeam(members: ParticipantSlot[]): string {
  return members.map((m) => m.name).join(" & ");
}

/** Generate round-1 knockout matches (Base44 parity). */
export async function generateKnockoutRound1(
  competition: Competition,
  slots: ParticipantSlot[],
): Promise<CompetitionMatch[]> {
  const isDoubles =
    competition.teamStructure === "doubles" ||
    competition.teamStructure === "mixed_doubles";

  const shuffled = shuffle(slots);
  const rows: Prisma.CompetitionMatchCreateManyInput[] = [];

  if (isDoubles) {
    const step = 4;
    for (let i = 0; i < shuffled.length; i += step) {
      const teamA = shuffled.slice(i, i + 2).filter(Boolean);
      const teamB = shuffled.slice(i + 2, i + 4).filter(Boolean);
      if (teamA.length >= 1 && teamB.length >= 1) {
        rows.push({
          competitionId: competition.id,
          round: 1,
          roundName: "Round 1",
          player1Email: teamA[0].email,
          player1Name: displayDoublesTeam(teamA),
          player2Email: teamB[0].email,
          player2Name: displayDoublesTeam(teamB),
          teamAEmails: teamA.map((p) => p.email),
          teamBEmails: teamB.map((p) => p.email),
          status: "scheduled",
          matchOrder: Math.floor(i / step) + 1,
        });
      }
    }
  } else {
    for (let i = 0; i < shuffled.length; i += 2) {
      if (shuffled[i + 1]) {
        rows.push({
          competitionId: competition.id,
          round: 1,
          roundName: "Round 1",
          player1Email: shuffled[i].email,
          player1Name: shuffled[i].name,
          player2Email: shuffled[i + 1].email,
          player2Name: shuffled[i + 1].name,
          status: "scheduled",
          matchOrder: i / 2 + 1,
        });
      }
    }
  }

  if (!rows.length) return [];
  await prisma.competitionMatch.createMany({ data: rows });
  return prisma.competitionMatch.findMany({
    where: { competitionId: competition.id, round: 1 },
    orderBy: { matchOrder: "asc" },
  });
}

type WinnerSlot = {
  email: string;
  name: string;
  emails: string[];
  isDoubles: boolean;
};

/** Advance knockout bracket after a match is confirmed (Base44 advanceBracket). */
export async function advanceBracketAfterConfirmedMatch(
  competitionId: string,
  confirmedMatchId: string,
): Promise<{ status: string; message: string; round?: number; matchesCreated?: number }> {
  const allMatches = await prisma.competitionMatch.findMany({
    where: { competitionId },
    orderBy: [{ round: "asc" }, { matchOrder: "asc" }],
  });

  const confirmedMatch = allMatches.find((m) => m.id === confirmedMatchId);
  if (!confirmedMatch) {
    return { status: "error", message: "Match not found" };
  }

  const currentRound = confirmedMatch.round;
  const currentRoundMatches = allMatches.filter((m) => m.round === currentRound);
  const allConfirmed = currentRoundMatches.every((m) => m.status === "confirmed");
  if (!allConfirmed) {
    return { status: "waiting", message: "Other matches in this round still pending" };
  }

  const winners: WinnerSlot[] = currentRoundMatches.map((m) => {
    const isDoubles = (m.teamAEmails?.length ?? 0) > 0;
    if (isDoubles) {
      const winEmails =
        m.winnerTeam === "team_a" ? m.teamAEmails || [] : m.teamBEmails || [];
      const winName = m.winnerTeam === "team_a" ? m.player1Name : m.player2Name;
      return {
        email: winEmails[0] || m.player1Email || "",
        name: winName || "Winner",
        emails: winEmails,
        isDoubles: true,
      };
    }
    const winEmail = m.winnerEmail || m.player1Email || "";
    const winName =
      winEmail === m.player1Email ? m.player1Name : m.player2Name;
    return {
      email: winEmail,
      name: winName || winEmail.split("@")[0],
      emails: [winEmail],
      isDoubles: false,
    };
  });

  const nextRound = currentRound + 1;
  const nextRows: Prisma.CompetitionMatchCreateManyInput[] = [];

  for (let i = 0; i < winners.length; i += 2) {
    if (winners[i] && winners[i + 1]) {
      const row: Prisma.CompetitionMatchCreateManyInput = {
        competitionId,
        round: nextRound,
        roundName: `Round ${nextRound}`,
        player1Email: winners[i].email,
        player1Name: winners[i].name,
        player2Email: winners[i + 1].email,
        player2Name: winners[i + 1].name,
        status: "scheduled",
        matchOrder: Math.floor(i / 2) + 1,
      };
      if (winners[i].isDoubles) {
        row.teamAEmails = winners[i].emails;
        row.teamBEmails = winners[i + 1].emails;
      }
      nextRows.push(row);
    } else if (winners[i]) {
      const bye: Prisma.CompetitionMatchCreateManyInput = {
        competitionId,
        round: nextRound,
        roundName: `Round ${nextRound}`,
        player1Email: winners[i].email,
        player1Name: winners[i].name,
        player2Email: null,
        player2Name: "BYE",
        winnerEmail: winners[i].email,
        winnerTeam: winners[i].isDoubles ? "team_a" : undefined,
        status: "confirmed",
        matchOrder: Math.floor(i / 2) + 1,
      };
      if (winners[i].isDoubles) {
        bye.teamAEmails = winners[i].emails;
      }
      nextRows.push(bye);
    }
  }

  if (nextRows.length > 0) {
    await prisma.competitionMatch.createMany({ data: nextRows });
  }

  const realMatches = nextRows.filter((m) => m.status !== "confirmed");
  if (realMatches.length === 0) {
    await prisma.competition.update({
      where: { id: competitionId },
      data: { status: "completed" },
    });
    return { status: "completed", message: "Tournament completed!" };
  }

  return {
    status: "advanced",
    message: "Bracket advanced",
    round: nextRound,
    matchesCreated: nextRows.length,
  };
}
