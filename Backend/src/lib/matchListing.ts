import { dedupeEmailsCi } from "./emailsCi.js";

/**
 * Matches listed under Discover / instant-play nearby should only show games
 * strangers can still join: free roster slot and not everyone has RSVP-confirmed yet.
 * When the lineup is full or fully confirmed, the game drops from search until someone
 * leaves or spots open (leave/cancel paths update roster + confirmations).
 */
export function matchIsDiscoverableJoinable(m: {
  players: string[];
  confirmedPlayerEmails: string[];
  maxPlayers: number;
}): boolean {
  const roster = dedupeEmailsCi(m.players);
  const confirmed = dedupeEmailsCi(m.confirmedPlayerEmails);
  return roster.length < m.maxPlayers && confirmed.length < m.maxPlayers;
}
