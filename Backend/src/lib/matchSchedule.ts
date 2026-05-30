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
const MS_MIN = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const MS_24H = 24 * MS_HOUR;
const DEFAULT_INSTANT_DURATION_MIN = 90;

function normalizeStatus(raw: string | null | undefined): string {
  return (raw == null || String(raw).trim() === "" ? "open" : String(raw).trim()).toLowerCase();
}

/** UTC epoch when the playable window ends (start + duration). */
export function matchPlayWindowEndUtcMs(match: {
  date: Date;
  timeLabel: string;
  durationMinutes?: number | null;
}): number {
  const start = matchScheduledStartUtcMs(match);
  if (Number.isNaN(start)) return NaN;
  const mins =
    typeof match.durationMinutes === "number" && Number.isFinite(match.durationMinutes)
      ? Math.max(30, Math.trunc(match.durationMinutes))
      : DEFAULT_INSTANT_DURATION_MIN;
  return start + mins * MS_MIN;
}

export function matchPlayWindowHasEnded(
  match: { date: Date; timeLabel: string; durationMinutes?: number | null },
  nowMs = Date.now(),
  graceMs = STALE_CANCEL_GRACE_MS,
): boolean {
  const end = matchPlayWindowEndUtcMs(match);
  if (Number.isNaN(end)) return true;
  return end + graceMs < nowMs;
}

/** Full roster may start until 24h after scheduled start (same as auto-cancel policy). */
export function fullRosterStartWindowExpired(
  match: { date: Date; timeLabel: string; isInstant: boolean },
  nowMs = Date.now(),
): boolean {
  if (match.isInstant) return matchPlayWindowHasEnded(match, nowMs);
  const start = matchScheduledStartUtcMs(match);
  if (Number.isNaN(start)) return true;
  return start + MS_24H + STALE_CANCEL_GRACE_MS < nowMs;
}

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

/**
 * Lists (discovery, home upcoming): hide open/full rows once their slot or start window has passed.
 * In-play / score statuses are not filtered here.
 */
export function matchAppearsOnDiscoveryListBySchedule(match: {
  date: Date;
  timeLabel: string;
  isInstant: boolean;
  status: string;
  durationMinutes?: number | null;
}): boolean {
  const st = normalizeStatus(match.status);
  const d = match.date instanceof Date ? match.date : new Date(match.date);
  const slot = {
    date: d,
    timeLabel: String(match.timeLabel || "").trim(),
    isInstant: match.isInstant,
    durationMinutes: match.durationMinutes,
  };

  if (st === "open" || st === "full") {
    if (match.isInstant) return !matchPlayWindowHasEnded(slot);
    if (st === "open") {
      return !scheduledNonInstantSlotIsExpired({
        date: d,
        timeLabel: slot.timeLabel,
        isInstant: false,
      });
    }
    return !fullRosterStartWindowExpired(slot);
  }
  return true;
}
