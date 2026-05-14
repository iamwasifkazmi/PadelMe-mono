import { Router } from "express";
import { runAllStaleMatchCleanups } from "../../lib/matchStaleCleanup.js";
export const maintenanceRouter = Router();
/**
 * Intended for GCP Cloud Scheduler / cron: Header Authorization: Bearer <STALE_MATCH_CRON_SECRET>,
 * or `x-cron-secret: <same>`.
 *
 * Runs: (1) cancel **open** non-instant matches whose scheduled start is in the past;
 * (2) cancel **full** non-instant matches still not started 24h after scheduled start — notifies roster.
 */
maintenanceRouter.post("/cleanup-stale-matches", async (req, res) => {
    const configured = (process.env.STALE_MATCH_CRON_SECRET || "").trim();
    const authRaw = req.headers.authorization;
    const bearer = typeof authRaw === "string" && /^Bearer\s+(.+)/i.exec(authRaw)?.[1]?.trim();
    const headerToken = bearer || String(req.headers["x-cron-secret"] || "").trim();
    if (!configured || headerToken !== configured) {
        return res.status(403).json({ error: "Forbidden" });
    }
    try {
        const result = await runAllStaleMatchCleanups();
        return res.json({ ok: true, ...result });
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error("[cleanup-stale-matches]", e);
        return res.status(500).json({ error: "Cleanup failed" });
    }
});
