/** YYYY-MM-DD string from storage (matches create endpoint / Prisma UTC date). */
function dateKeyFromStoredDate(date: Date): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Same interpretation as POST /matches: calendar day UTC + clock from timeLabel. */
export function scheduledStartUtcMs(dateStr: string, timeLabel: string): number {
  const base = new Date(dateStr.trim());
  if (Number.isNaN(base.getTime())) return NaN;
  const parts = String(timeLabel || "").trim().split(":");
  const h = Number.parseInt(parts[0] ?? "", 10);
  const m = Number.parseInt(parts[1] ?? "", 10);
  return Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate(),
    Number.isFinite(h) ? h : 0,
    Number.isFinite(m) ? m : 0,
    0,
    0,
  );
}

export function matchScheduledStartUtcMs(match: { date: Date; timeLabel: string }): number {
  const dateStr = dateKeyFromStoredDate(match.date);
  if (!dateStr) return NaN;
  return scheduledStartUtcMs(dateStr, match.timeLabel);
}

/** Small grace so clock skew does not falsely block a match at the boundary. */
const JOIN_GRACE_MS = 120_000;
const STALE_CANCEL_GRACE_MS = 120_000;

export function scheduledNonInstantSlotIsExpired(
  match: { date: Date; timeLabel: string; isInstant: boolean },
  nowMs = Date.now(),
  graceMs = STALE_CANCEL_GRACE_MS,
): boolean {
  if (match.isInstant) return false;
  const start = matchScheduledStartUtcMs(match);
  if (Number.isNaN(start)) return true;
  return start + graceMs < nowMs;
}

export function scheduledNonInstantJoinAllowed(
  match: { date: Date; timeLabel: string; isInstant: boolean },
  nowMs = Date.now(),
): boolean {
  if (match.isInstant) return true;
  const start = matchScheduledStartUtcMs(match);
  if (Number.isNaN(start)) return false;
  return start >= nowMs - JOIN_GRACE_MS;
}

/** Drop past scheduled slots for pre-start statuses; keep instant + in-play / score / history rows. */
export function matchAppearsOnDiscoveryListBySchedule(match: {
  date: Date;
  timeLabel: string;
  isInstant: boolean;
  status: string;
}): boolean {
  if (match.isInstant) return true;
  const raw = match.status;
  const st = (raw == null || String(raw).trim() === "" ? "open" : String(raw).trim()).toLowerCase();
  if (st !== "open" && st !== "full") return true;
  const d = match.date instanceof Date ? match.date : new Date(match.date);
  return !scheduledNonInstantSlotIsExpired({
    date: d,
    timeLabel: String(match.timeLabel || "").trim(),
    isInstant: false,
  });
}
