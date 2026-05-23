import Stripe from "stripe";
import { prisma } from "./prisma.js";

const SETTINGS_ID = "default";
const PRODUCT_NAME = "MiPadel Premium";
const PRODUCT_META = { mipadel_product: "premium_monthly" };
const PRICE_AMOUNT_PENCE = 499;
const PRICE_CURRENCY = "gbp";

export type StripeBillingIds = { productId: string; priceId: string };

export async function getStripeBillingIdsFromDb(): Promise<StripeBillingIds | null> {
  const row = await prisma.billingSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (row?.stripeProductId?.trim() && row?.stripePriceId?.trim()) {
    return { productId: row.stripeProductId.trim(), priceId: row.stripePriceId.trim() };
  }
  return null;
}

export async function saveStripeBillingIds(ids: StripeBillingIds): Promise<void> {
  await prisma.billingSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      stripeProductId: ids.productId,
      stripePriceId: ids.priceId,
    },
    update: {
      stripeProductId: ids.productId,
      stripePriceId: ids.priceId,
    },
  });
}

async function findOrCreateProduct(stripe: Stripe, existingProductId?: string): Promise<string> {
  if (existingProductId) {
    try {
      const p = await stripe.products.retrieve(existingProductId);
      if (!p.deleted) return p.id;
    } catch {
      /* create below */
    }
  }

  const listed = await stripe.products.list({ limit: 100, active: true });
  const match = listed.data.find(
    (p) =>
      p.metadata?.mipadel_product === PRODUCT_META.mipadel_product || p.name === PRODUCT_NAME,
  );
  if (match) return match.id;

  const created = await stripe.products.create({
    name: PRODUCT_NAME,
    description: "Host tournaments and leagues on MiPadel",
    metadata: PRODUCT_META,
  });
  return created.id;
}

async function findOrCreatePrice(
  stripe: Stripe,
  productId: string,
  existingPriceId?: string,
): Promise<string> {
  if (existingPriceId) {
    try {
      const pr = await stripe.prices.retrieve(existingPriceId);
      if (pr.active && pr.product === productId) return pr.id;
    } catch {
      /* create below */
    }
  }

  const prices = await stripe.prices.list({ product: productId, active: true, limit: 50 });
  const monthlyGbp = prices.data.find(
    (p) =>
      p.currency === PRICE_CURRENCY &&
      p.recurring?.interval === "month" &&
      p.unit_amount === PRICE_AMOUNT_PENCE,
  );
  if (monthlyGbp) return monthlyGbp.id;

  const created = await stripe.prices.create({
    product: productId,
    currency: PRICE_CURRENCY,
    unit_amount: PRICE_AMOUNT_PENCE,
    recurring: { interval: "month" },
    nickname: "MiPadel Premium monthly",
    metadata: PRODUCT_META,
  });
  return created.id;
}

/**
 * Ensures Stripe Product + monthly Price exist and stores IDs in BillingSettings.
 * Requires STRIPE_SECRET_KEY in the environment.
 */
export async function ensureStripeBillingCatalog(): Promise<StripeBillingIds> {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured");

  const stripe = new Stripe(secret);
  const existing = await getStripeBillingIdsFromDb();

  const productId = await findOrCreateProduct(stripe, existing?.productId);
  const priceId = await findOrCreatePrice(stripe, productId, existing?.priceId);
  const ids = { productId, priceId };
  await saveStripeBillingIds(ids);
  return ids;
}
