#!/usr/bin/env tsx
/**
 * Creates (or reuses) Stripe Product + monthly Price for MiPadel Premium,
 * then writes STRIPE_PRODUCT_ID and STRIPE_PRICE_ID into Backend/.env.
 *
 * Requires STRIPE_SECRET_KEY in Backend/.env (test or live).
 *
 * Usage (from Backend/):
 *   npm run seed:stripe
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import Stripe from "stripe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const envPath = path.join(backendRoot, ".env");

dotenv.config({ path: envPath });

const PRODUCT_NAME = "MiPadel Premium";
const PRODUCT_META = { mipadel_product: "premium_monthly" };
const PRICE_AMOUNT_PENCE = 499; // £4.99 — matches Base44 copy
const PRICE_CURRENCY = "gbp";

function upsertEnvLines(updates: Record<string, string>) {
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}="${value}"`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      if (content.length && !content.endsWith("\n")) content += "\n";
      content += `${line}\n`;
    }
  }
  fs.writeFileSync(envPath, content, "utf8");
}

async function findOrCreateProduct(stripe: Stripe): Promise<string> {
  const existingId = process.env.STRIPE_PRODUCT_ID?.trim();
  if (existingId) {
    try {
      const p = await stripe.products.retrieve(existingId);
      if (!p.deleted) {
        console.log(`Using STRIPE_PRODUCT_ID from .env: ${p.id}`);
        return p.id;
      }
    } catch {
      console.warn(`STRIPE_PRODUCT_ID ${existingId} not found — creating new product`);
    }
  }

  const listed = await stripe.products.list({ limit: 100, active: true });
  const match = listed.data.find(
    (p) =>
      p.metadata?.mipadel_product === PRODUCT_META.mipadel_product || p.name === PRODUCT_NAME,
  );
  if (match) {
    console.log(`Reusing existing Stripe product: ${match.id} (${match.name})`);
    return match.id;
  }

  const created = await stripe.products.create({
    name: PRODUCT_NAME,
    description: "Host tournaments and leagues on MiPadel",
    metadata: PRODUCT_META,
  });
  console.log(`Created Stripe product: ${created.id}`);
  return created.id;
}

async function findOrCreatePrice(stripe: Stripe, productId: string): Promise<string> {
  const existingId = process.env.STRIPE_PRICE_ID?.trim();
  if (existingId) {
    try {
      const pr = await stripe.prices.retrieve(existingId);
      if (pr.active && pr.product === productId) {
        console.log(`Using STRIPE_PRICE_ID from .env: ${pr.id}`);
        return pr.id;
      }
    } catch {
      console.warn(`STRIPE_PRICE_ID ${existingId} not valid — creating new price`);
    }
  }

  const prices = await stripe.prices.list({ product: productId, active: true, limit: 50 });
  const monthlyGbp = prices.data.find(
    (p) =>
      p.currency === PRICE_CURRENCY &&
      p.recurring?.interval === "month" &&
      p.unit_amount === PRICE_AMOUNT_PENCE,
  );
  if (monthlyGbp) {
    console.log(`Reusing existing Stripe price: ${monthlyGbp.id}`);
    return monthlyGbp.id;
  }

  const created = await stripe.prices.create({
    product: productId,
    currency: PRICE_CURRENCY,
    unit_amount: PRICE_AMOUNT_PENCE,
    recurring: { interval: "month" },
    nickname: "MiPadel Premium monthly",
    metadata: PRODUCT_META,
  });
  console.log(`Created Stripe price: ${created.id} (£${(PRICE_AMOUNT_PENCE / 100).toFixed(2)}/month)`);
  return created.id;
}

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    console.error("Missing STRIPE_SECRET_KEY in Backend/.env");
    process.exit(1);
  }

  const stripe = new Stripe(secret);
  const account = await stripe.accounts.retrieve();
  console.log(`Stripe account: ${account.id} (${account.settings?.dashboard?.display_name || "test mode"})`);

  const productId = await findOrCreateProduct(stripe);
  const priceId = await findOrCreatePrice(stripe, productId);

  upsertEnvLines({
    STRIPE_PRODUCT_ID: productId,
    STRIPE_PRICE_ID: priceId,
  });

  console.log("\nUpdated Backend/.env:");
  console.log(`  STRIPE_PRODUCT_ID=${productId}`);
  console.log(`  STRIPE_PRICE_ID=${priceId}`);
  console.log("\nNext: add STRIPE_WEBHOOK_SECRET (Stripe Dashboard → Webhooks) for production.");
  console.log("  Endpoint: POST https://YOUR-BACKEND/api/billing/webhook");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
