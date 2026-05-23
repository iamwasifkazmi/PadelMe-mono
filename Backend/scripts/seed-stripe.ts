#!/usr/bin/env tsx
/**
 * Creates (or reuses) Stripe Product + monthly Price for MiPadel Premium
 * and saves IDs to BillingSettings in the database (not .env).
 *
 * Requires STRIPE_SECRET_KEY and DATABASE_URL in Backend/.env.
 *
 * Usage (from Backend/):
 *   npm run seed:stripe
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ensureStripeBillingCatalog } from "../src/lib/stripeCatalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(backendRoot, ".env") });

async function main() {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    console.error("Missing STRIPE_SECRET_KEY in Backend/.env");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("Missing DATABASE_URL in Backend/.env");
    process.exit(1);
  }

  const { productId, priceId } = await ensureStripeBillingCatalog();

  console.log("\nSaved to BillingSettings (database):");
  console.log(`  stripeProductId=${productId}`);
  console.log(`  stripePriceId=${priceId}`);
  console.log("\nDo not put STRIPE_PRICE_ID in .env — Cloud Run only needs STRIPE_SECRET_KEY.");
  console.log("Next: add STRIPE_WEBHOOK_SECRET in Stripe Dashboard → Webhooks for renewals/cancellations.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
