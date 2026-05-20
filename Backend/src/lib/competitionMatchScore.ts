import type { Competition, CompetitionMatch } from "@prisma/client";
import { prisma } from "./prisma.js";
import { advanceBracketAfterConfirmedMatch } from "./competitionBracket.js";
import { applyEloAfterCompetitionMatch } from "./competitionElo.js";

function isDoublesMatch(m: CompetitionMatch): boolean {
  return (m.teamAEmails?.length ?? 0) > 0 || (m.teamBEmails?.length ?? 0) > 0;
}

function matchParticipantEmails(m: CompetitionMatch): string[] {
  if (isDoublesMatch(m)) {
    return [...(m.teamAEmails || []), ...(m.teamBEmails || [])];
  }
  return [m.player1Email, m.player2Email].filter(Boolean) as string[];
}

function resolveWinner(
  m: CompetitionMatch,
  s1: number,
  s2: number,
): { winnerEmail: string | null; winnerTeam: string | null } {
  if (isDoublesMatch(m)) {
    if (s1 === s2) return { winnerEmail: null, winnerTeam: null };
    return { winnerEmail: null, winnerTeam: s1 >= s2 ? "team_a" : "team_b" };
  }
  const winnerEmail = s1 >= s2 ? m.player1Email : m.player2Email;
  return { winnerEmail: winnerEmail ?? null, winnerTeam: null };
}

export async function confirmCompetitionMatchScore(
  competition: Competition,
  match: CompetitionMatch,
  actorEmail: string,
  scoreP1: string,
  scoreP2: string,
  opts?: { hostOverride?: boolean },
): Promise<CompetitionMatch> {
  const s1 = Number(scoreP1);
  const s2 = Number(scoreP2);
  if (!scoreP1 || !scoreP2 || Number.isNaN(s1) || Number.isNaN(s2)) {
    throw new Error("Both scores are required");
  }

  const { winnerEmail, winnerTeam } = resolveWinner(match, s1, s2);
  if (!winnerEmail && !winnerTeam && !opts?.hostOverride) {
    throw new Error("Draws are not allowed for this match");
  }

  const updated = await prisma.competitionMatch.update({
    where: { id: match.id },
    data: {
      submittedScoreP1: scoreP1,
      submittedScoreP2: scoreP2,
      scorePlayer1: scoreP1,
      scorePlayer2: scoreP2,
      submittedBy: actorEmail,
      confirmedBy: actorEmail,
      winnerEmail: winnerEmail ?? undefined,
      winnerTeam: winnerTeam ?? undefined,
      status: "confirmed",
    },
  });

  await applyEloAfterCompetitionMatch(competition, updated);

  if (competition.format === "knockout" && competition.type === "tournament") {
    await advanceBracketAfterConfirmedMatch(competition.id, match.id);
  }

  return updated;
}

export async function submitCompetitionMatchScore(
  competition: Competition,
  match: CompetitionMatch,
  actorEmail: string,
  scoreP1: string,
  scoreP2: string,
): Promise<CompetitionMatch> {
  const participants = matchParticipantEmails(match).map((e) => e.toLowerCase());
  if (!participants.includes(actorEmail.toLowerCase())) {
    throw new Error("Only match participants can submit scores");
  }

  const isHost = competition.hostEmail?.toLowerCase() === actorEmail.toLowerCase();
  if (isHost) {
    return confirmCompetitionMatchScore(competition, match, actorEmail, scoreP1, scoreP2, {
      hostOverride: true,
    });
  }

  return prisma.competitionMatch.update({
    where: { id: match.id },
    data: {
      submittedScoreP1: scoreP1,
      submittedScoreP2: scoreP2,
      submittedBy: actorEmail,
      status: "pending_validation",
    },
  });
}

export async function validateSubmittedCompetitionScore(
  competition: Competition,
  match: CompetitionMatch,
  actorEmail: string,
  accept: boolean,
  rejectionReason?: string,
): Promise<CompetitionMatch> {
  const participants = matchParticipantEmails(match).map((e) => e.toLowerCase());
  if (!participants.includes(actorEmail.toLowerCase())) {
    throw new Error("Only match participants can validate scores");
  }
  if (match.submittedBy?.toLowerCase() === actorEmail.toLowerCase()) {
    throw new Error("Submitter cannot validate their own score");
  }
  if (match.status !== "pending_validation") {
    throw new Error("No score pending validation");
  }

  if (!accept) {
    return prisma.competitionMatch.update({
      where: { id: match.id },
      data: {
        rejectedBy: actorEmail,
        rejectionReason: rejectionReason || "Disputed",
        status: "disputed",
      },
    });
  }

  return confirmCompetitionMatchScore(
    competition,
    match,
    actorEmail,
    match.submittedScoreP1 || "",
    match.submittedScoreP2 || "",
  );
}
