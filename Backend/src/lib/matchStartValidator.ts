import type { Match } from "@prisma/client";
import {
  effectiveTeamsAtStart,
  isDoublesStyle,
  teamsPartitionPlayers,
} from "./matchTeams.js";
import {
  type MatchEligibilityProfile,
  validateRosterEligibility,
} from "./matchEligibility.js";

export { effectiveTeamsAtStart } from "./matchTeams.js";

/** Base44 structural rules: min roster, doubles lock + 2v2 split, no duplicate team assignment. */
export function validateMatchStructure(match: Match): { valid: boolean; reason: string } {
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

/** Full Base44-style validation including roster eligibility (requires loaded user profiles). */
export function validateMatchStart(
  match: Match,
  rosterProfiles: Map<string, MatchEligibilityProfile>,
): { valid: boolean; reason: string } {
  const structural = validateMatchStructure(match);
  if (!structural.valid) return structural;
  const roster = validateRosterEligibility(match, rosterProfiles);
  if (!roster.valid) return roster;
  return { valid: true, reason: "" };
}
