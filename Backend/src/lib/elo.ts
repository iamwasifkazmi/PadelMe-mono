/**
 * Elo for team sports: each player uses their own rating vs the opposing team's
 * average rating (see Base44-style doubles handling).
 *
 * Stored rating on User / PlayerStats is updated only when a match completes.
 * `resolveEffectiveElo` applies inactivity decay on read and before the next match.
 */

export const DEFAULT_ELO = 1000;
export const ELO_FLOOR = 800;

/** Grace period before decay; then one decay step every `STEP_DAYS` days. */
export const INACTIVITY_GRACE_DAYS = 21;
export const INACTIVITY_STEP_DAYS = 7;
/** Points pulled toward DEFAULT_ELO per step (after grace). */
export const INACTIVITY_PULL_PER_STEP = 5;

export function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

export function kFactorFromMatchTags(tags: string[] | undefined | null): number {
  const t = (tags || []).map((x) => String(x).toLowerCase());
  if (t.includes("tournament")) return 40;
  if (t.includes("social")) return 20;
  return 32;
}

export function skillLabelFromElo(elo: number): string {
  if (elo >= 1600) return "elite";
  if (elo >= 1400) return "advanced";
  if (elo >= 1200) return "intermediate";
  if (elo >= 1000) return "improver";
  return "beginner";
}

function clampElo(value: number): number {
  return Math.max(ELO_FLOOR, Math.round(value));
}

/** How many points to move stored rating toward DEFAULT_ELO (inactive rated play). */
export function inactivityDecayAmount(
  storedElo: number,
  lastRatedMatchAt: Date | null,
  now: Date = new Date(),
): number {
  if (!lastRatedMatchAt) return 0;
  const ms = now.getTime() - lastRatedMatchAt.getTime();
  if (ms <= 0) return 0;
  const days = Math.floor(ms / 86_400_000);
  if (days <= INACTIVITY_GRACE_DAYS) return 0;
  const steps = Math.floor((days - INACTIVITY_GRACE_DAYS) / INACTIVITY_STEP_DAYS);
  if (steps <= 0) return 0;
  const cap = Math.abs(storedElo - DEFAULT_ELO);
  if (cap === 0) return 0;
  return Math.min(steps * INACTIVITY_PULL_PER_STEP, cap);
}

/** Rating used for display and as the baseline before applying a new match outcome. */
export function resolveEffectiveElo(
  storedElo: number,
  lastRatedMatchAt: Date | null,
  now: Date = new Date(),
): number {
  const pull = inactivityDecayAmount(storedElo, lastRatedMatchAt, now);
  if (pull === 0) return clampElo(storedElo);
  if (storedElo === DEFAULT_ELO) return DEFAULT_ELO;
  const direction = storedElo > DEFAULT_ELO ? -1 : 1;
  return clampElo(storedElo + direction * pull);
}

export function averageElo(values: number[]): number {
  if (!values.length) return DEFAULT_ELO;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function eloDelta(
  playerEffective: number,
  opponentAvgEffective: number,
  actualScore: 0 | 1,
  k: number,
): number {
  const expected = expectedScore(playerEffective, opponentAvgEffective);
  return Math.round(k * (actualScore - expected));
}
