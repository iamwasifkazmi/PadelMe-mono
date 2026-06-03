/** Aligns with app Edit Profile travel radius chips (km). */
export const TRAVEL_RADIUS_OPTIONS_KM = [5, 10, 20, 50] as const;

export const DEFAULT_TRAVEL_RADIUS_KM = 10;

export function coerceTravelRadiusKm(raw: unknown, fallback = DEFAULT_TRAVEL_RADIUS_KM): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  const allowed = TRAVEL_RADIUS_OPTIONS_KM as readonly number[];
  if (allowed.includes(n)) return n;
  let best = fallback;
  for (const opt of allowed) {
    if (Math.abs(opt - n) < Math.abs(best - n)) best = opt;
  }
  return best;
}
