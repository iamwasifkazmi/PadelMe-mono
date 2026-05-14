/**
 * One-off / manual: stale match cleanups (open past slot + full roster never started 24h after start).
 * Uses DATABASE_URL from .env (same as Prisma).
 *
 *   cd Backend && npx tsx scripts/run-stale-match-cleanup.ts
 */
import "dotenv/config";
import { runAllStaleMatchCleanups } from "../src/lib/matchStaleCleanup.js";

async function main() {
  const r = await runAllStaleMatchCleanups();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, ...r }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
