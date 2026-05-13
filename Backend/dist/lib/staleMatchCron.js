import cron from "node-cron";
import { cancelStalePastScheduledMatches } from "./matchStaleCleanup.js";
/** In-process cron (runs when the Node process stays up). Pair with GCP Cloud Scheduler + POST /api/internal/cleanup-stale-matches when using scale-to-zero. */
export function startStaleMatchCron() {
    if (process.env.DISABLE_STALE_MATCH_CRON === "1") {
        // eslint-disable-next-line no-console
        console.log("[stale-match-cron] disabled (DISABLE_STALE_MATCH_CRON=1)");
        return;
    }
    const run = () => {
        void cancelStalePastScheduledMatches().catch((err) => {
            // eslint-disable-next-line no-console
            console.error("[stale-match-cron]", err);
        });
    };
    // Short delay after boot so DB / Prisma warm up first.
    const bootDelayMs = Math.min(120_000, Math.max(5_000, Number.parseInt(process.env.STALE_MATCH_BOOT_DELAY_MS || "45000", 10) || 45_000));
    setTimeout(run, bootDelayMs);
    // Midnight and noon UTC (~twice daily).
    cron.schedule("0 0 * * *", run);
    cron.schedule("0 12 * * *", run);
    // eslint-disable-next-line no-console
    console.log(`[stale-match-cron] scheduled twice daily UTC (00:00, 12:00); first run in ${bootDelayMs}ms`);
}
