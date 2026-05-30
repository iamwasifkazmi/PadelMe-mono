import { runAllStaleMatchCleanups } from "./matchStaleCleanup.js";
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
let lastRunMs = 0;
let inFlight = null;
/** Best-effort stale match cancellation (Cloud Run scale-to-zero may skip in-process cron). */
export function maybeRunStaleMatchCleanup(nowMs = Date.now()) {
    const intervalMs = Number.parseInt(process.env.STALE_MATCH_CLEANUP_INTERVAL_MS || "", 10) || DEFAULT_INTERVAL_MS;
    if (nowMs - lastRunMs < intervalMs)
        return;
    if (inFlight)
        return;
    lastRunMs = nowMs;
    inFlight = runAllStaleMatchCleanups(nowMs)
        .then(() => undefined)
        .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[maybeRunStaleMatchCleanup]", err);
    })
        .finally(() => {
        inFlight = null;
    });
}
