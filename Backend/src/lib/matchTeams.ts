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

export function isDoublesStyle(match: Pick<Match, "matchType" | "maxPlayers">): boolean {
  return match.matchType !== MatchType.singles && match.maxPlayers >= 4;
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

/** Infer winner from score strings (set scores comma-separated or single total). */
export function inferWinnerTeam(
  scoreTeamA: string,
  scoreTeamB: string,
): "team_a" | "team_b" | null {
  const rawA = (scoreTeamA || "").trim();
  const rawB = (scoreTeamB || "").trim();
  if (!rawA || !rawB) return null;
  if (rawA.includes(",") || rawB.includes(",")) {
    const as = rawA.split(",").map((s) => s.trim()).filter(Boolean);
    const bs = rawB.split(",").map((s) => s.trim()).filter(Boolean);
    let winsA = 0;
    const n = Math.min(as.length, bs.length);
    for (let i = 0; i < n; i++) {
      const na = Number(as[i]);
      const nb = Number(bs[i]);
      if (Number.isNaN(na) || Number.isNaN(nb)) continue;
      if (na > nb) winsA++;
      else if (na < nb) winsA--;
    }
    if (winsA > 0) return "team_a";
    if (winsA < 0) return "team_b";
    return null;
  }
  const na = Number(rawA);
  const nb = Number(rawB);
  if (Number.isNaN(na) || Number.isNaN(nb)) return null;
  if (na > nb) return "team_a";
  if (nb > na) return "team_b";
  return null;
}
