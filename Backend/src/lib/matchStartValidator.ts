import type { Match } from "@prisma/client";
import { isDoublesStyle, teamsPartitionPlayers } from "./matchTeams.js";

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

/** Base44-style rules: min roster, doubles lock + 2v2 split, no duplicate team assignment. */
export function validateMatchStart(match: Match): { valid: boolean; reason: string } {
  const players = match.players || [];
  const doublesStyle = isDoublesStyle(match);
  const { teamA, teamB } = effectiveTeamsAtStart(match);

  const minRequired = doublesStyle ? 4 : 2;
  if (players.length < minRequired) {
    const missing = minRequired - players.length;
    if (doublesStyle) {
      if (teamA.length < 2) {
        return { valid: false, reason: `Team A needs ${2 - teamA.length} more player(s)` };
      }
      if (teamB.length < 2) {
        return { valid: false, reason: `Team B needs ${2 - teamB.length} more player(s)` };
      }
      return { valid: false, reason: `Waiting for ${missing} more player(s)` };
    }
    return { valid: false, reason: `Waiting for ${missing} more player(s)` };
  }

  if (doublesStyle && players.length >= 4) {
    if (teamA.length < 2) {
      return { valid: false, reason: `Team A needs ${2 - teamA.length} more player(s)` };
    }
    if (teamB.length < 2) {
      return { valid: false, reason: `Team B needs ${2 - teamB.length} more player(s)` };
    }
    if (!match.teamsLocked) {
      return { valid: false, reason: "Organiser must lock teams before starting doubles" };
    }
    if (!teamsPartitionPlayers(teamA, teamB, players)) {
      return { valid: false, reason: "Teams must partition all players" };
    }
    if (teamA.length !== 2 || teamB.length !== 2) {
      return { valid: false, reason: "Doubles requires two players on each team" };
    }
  }

  const allTeamPlayers = [...teamA, ...teamB];
  if (new Set(allTeamPlayers).size !== allTeamPlayers.length) {
    return { valid: false, reason: "A player cannot be on multiple teams" };
  }

  if (!doublesStyle && (teamA.length > 0 || teamB.length > 0)) {
    if (teamA.length !== 1 || teamB.length !== 1) {
      return { valid: false, reason: "Teams misconfigured for singles match" };
    }
  }

  return { valid: true, reason: "" };
}
