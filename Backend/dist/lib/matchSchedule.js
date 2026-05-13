/** YYYY-MM-DD string from storage (matches create endpoint / Prisma UTC date). */
function dateKeyFromStoredDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime()))
        return "";
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
}
/** Same interpretation as POST /matches: calendar day UTC + clock from timeLabel. */
export function scheduledStartUtcMs(dateStr, timeLabel) {
    const base = new Date(dateStr.trim());
    if (Number.isNaN(base.getTime()))
        return NaN;
    const parts = String(timeLabel || "").trim().split(":");
    const h = Number.parseInt(parts[0] ?? "", 10);
    const m = Number.parseInt(parts[1] ?? "", 10);
    return Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
}
export function matchScheduledStartUtcMs(match) {
    const dateStr = dateKeyFromStoredDate(match.date);
    if (!dateStr)
        return NaN;
    return scheduledStartUtcMs(dateStr, match.timeLabel);
}
/** Small grace so clock skew does not falsely block a match at the boundary. */
const JOIN_GRACE_MS = 120_000;
const STALE_CANCEL_GRACE_MS = 120_000;
export function scheduledNonInstantSlotIsExpired(match, nowMs = Date.now(), graceMs = STALE_CANCEL_GRACE_MS) {
    if (match.isInstant)
        return false;
    const start = matchScheduledStartUtcMs(match);
    if (Number.isNaN(start))
        return true;
    return start + graceMs < nowMs;
}
export function scheduledNonInstantJoinAllowed(match, nowMs = Date.now()) {
    if (match.isInstant)
        return true;
    const start = matchScheduledStartUtcMs(match);
    if (Number.isNaN(start))
        return false;
    return start >= nowMs - JOIN_GRACE_MS;
}
/**
 * Discovery list: hide past slots only for **open** (still recruiting). Full rosters and any
 * in-play / score / history status stay visible so a game can be started or continued.
 */
export function matchAppearsOnDiscoveryListBySchedule(match) {
    if (match.isInstant)
        return true;
    const raw = match.status;
    const st = (raw == null || String(raw).trim() === "" ? "open" : String(raw).trim()).toLowerCase();
    if (st !== "open")
        return true;
    const d = match.date instanceof Date ? match.date : new Date(match.date);
    return !scheduledNonInstantSlotIsExpired({
        date: d,
        timeLabel: String(match.timeLabel || "").trim(),
        isInstant: false,
    });
}
