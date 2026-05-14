import cron from "node-cron";
import { runAllStaleMatchCleanups } from "./matchStaleCleanup.js";
/** In-process cron (runs when the Node process stays up). Pair with GCP Cloud Scheduler + POST /api/internal/cleanup-stale-matches when using scale-to-zero. */
export function startStaleMatchCron() {
    if (process.env.DISABLE_STALE_MATCH_CRON === "1") {
        // eslint-disable-next-line no-console
        console.log("[stale-match-cron] disabled (DISABLE_STALE_MATCH_CRON=1)");
        return;
    }
    const run = () => {
        void runAllStaleMatchCleanups().catch((err) => {
            // eslint-disable-next-line no-console
            console.error("[stale-match-cron]", err);
        });
    };
    // Short delay after boot so DB / Prisma warm up first.
    const bootDelayMs = Math.min(120_000, Math.max(5_000, Number.parseInt(process.env.STALE_MATCH_BOOT_DELAY_MS || "45000", 10) || 45_000));
    setTimeout(run, bootDelayMs);
    // Hourly so full-roster auto-cancel (24h after scheduled start) runs within ~1h of the deadline.
    cron.schedule("7 * * * *", run);
    // eslint-disable-next-line no-console
    console.log(`[stale-match-cron] scheduled hourly at :07 UTC; first run in ${bootDelayMs}ms`);
}
