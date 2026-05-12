/**
 * One-off / manual: cancel **open** non-instant matches whose scheduled start is in the past.
 * Uses DATABASE_URL from .env (same as Prisma).
 *
 *   cd Backend && npx tsx scripts/run-stale-match-cleanup.ts
 */
import "dotenv/config";
import { cancelStalePastScheduledMatches } from "../src/lib/matchStaleCleanup.js";

async function main() {
  const r = await cancelStalePastScheduledMatches();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, cancelled: r.cancelled, matchIds: r.matchIds }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
