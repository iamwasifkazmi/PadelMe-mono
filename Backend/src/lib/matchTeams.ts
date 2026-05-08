import type { Match } from "@prisma/client";
import { MatchType } from "@prisma/client";

/** True if teamA ∪ teamB is exactly the match players (each once). */
export function teamsPartitionPlayers(
  teamA: string[],
  teamB: string[],
  players: string[],
): boolean {
  if (!players.length) return false;
  const u = new Set([...teamA, ...teamB]);
  if (u.size !== teamA.length + teamB.length) return false;
  for (const p of [...teamA, ...teamB]) {
    if (!players.includes(p)) return false;
  }
  if (u.size !== players.length) return false;
  return true;
}

/** Doubles lobby: 2v2, line-ups locked before start. maxPlayers≥4 counts even if DB matchType defaulted to singles. */
export function isDoublesStyle(match: Pick<Match, "matchType" | "maxPlayers">): boolean {
  if (match.matchType === MatchType.singles && match.maxPlayers <= 2) {
    return false;
  }
  return (
    match.matchType === MatchType.doubles ||
    match.matchType === MatchType.mixed_doubles ||
    match.maxPlayers >= 4
  );
}

/** Same team fill logic as `POST /matches/:id/start` (singles: auto 1v1 when unset). */
export function effectiveTeamsAtStart(match: Match): { teamA: string[]; teamB: string[] } {
  let teamA = [...match.teamA];
  let teamB = [...match.teamB];
  if (
    match.players.length === 2 &&
    !isDoublesStyle(match) &&
    (teamA.length === 0 || teamB.length === 0)
  ) {
    teamA = [match.players[0]];
    teamB = [match.players[1]];
  }
  return { teamA, teamB };
}

/** Balanced 2v2: strongest + weakest vs two middle (by effective Elo). */
export function balancePadelTeams(
  players: string[],
  eloByEmail: Record<string, number>,
): { teamA: string[]; teamB: string[] } {
  if (players.length < 2) return { teamA: [...players], teamB: [] };
  if (players.length === 2) {
    return { teamA: [players[0]], teamB: [players[1]] };
  }
  const sorted = [...players].sort((a, b) => (eloByEmail[b] ?? 1000) - (eloByEmail[a] ?? 1000));
  if (sorted.length >= 4) {
    return {
      teamA: [sorted[0], sorted[3]],
      teamB: [sorted[1], sorted[2]],
    };
  }
  const mid = Math.ceil(sorted.length / 2);
  return {
    teamA: sorted.slice(0, mid),
    teamB: sorted.slice(mid),
  };
}

/**
 * Infer winner from score strings (comma-separated per-set games, or single totals).
 * Matches Base44 `MatchValidateModal.getWinner`: majority of sets wins; ties resolve to team_b;
 * simple numeric compare uses strict `>`, so equal totals → team_b.
 */
export function inferWinnerTeam(
  scoreTeamA: string,
  scoreTeamB: string,
): "team_a" | "team_b" | null {
  const rawA = (scoreTeamA || "").trim();
  const rawB = (scoreTeamB || "").trim();
  if (!rawA || !rawB) return null;
  const as = rawA.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  const bs = rawB.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (!as.length || !bs.length) return null;

  if (as.length > 1) {
    const winsA = as.filter((s, i) => Number(s) > Number(bs[i] ?? 0)).length;
    return winsA > as.length / 2 ? "team_a" : "team_b";
  }

  const na = Number(as[0]);
  const nb = Number(bs.length ? bs[0] : rawB);
  if (Number.isNaN(na) || Number.isNaN(nb)) return null;
  return na > nb ? "team_a" : "team_b";
}
