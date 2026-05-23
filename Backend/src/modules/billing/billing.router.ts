import { Router } from "express";
import type Stripe from "stripe";
import { prisma } from "../../lib/prisma.js";
import { requireAuthUser } from "../../lib/jwtAuth.js";
import { authUserPayload } from "../../lib/authUserPayload.js";
import { appPublicOrigin } from "../../lib/appDomain.js";
import {
  activatePremiumFromStripe,
  ensureStripeCustomer,
  getStripe,
  resolveUserIdFromStripeEvent,
  getStripePriceId,
  stripeConfigured,
  stripeSecretConfigured,
} from "../../lib/stripeBilling.js";

export const billingRouter = Router();

function appBaseUrl(): string {
  return appPublicOrigin();
}

billingRouter.get("/configured", async (_req, res) => {
  res.json({ stripe: await stripeConfigured() });
});

billingRouter.post("/checkout-session", async (req, res) => {
  const user = await requireAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (!(await stripeConfigured())) {
    const hint = stripeSecretConfigured()
      ? "Run npm run seed:stripe to store the Premium price in the database"
      : "Set STRIPE_SECRET_KEY and run npm run seed:stripe";
    return res.status(503).json({
      error: `Stripe is not configured (${hint})`,
      code: "stripe_not_configured",
    });
  }

  const priceId = (await getStripePriceId())!;
  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(user);

  const successUrl =
    process.env.STRIPE_SUCCESS_URL?.trim() ||
    `${appBaseUrl()}/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    process.env.STRIPE_CANCEL_URL?.trim() || `${appBaseUrl()}/subscription/cancel`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: user.id,
    metadata: { userId: user.id },
    subscription_data: {
      metadata: { userId: user.id },
    },
    allow_promotion_codes: true,
  });

  return res.json({ url: session.url, sessionId: session.id });
});

billingRouter.post("/portal-session", async (req, res) => {
  const user = await requireAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!(await stripeConfigured())) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  const customerId = await ensureStripeCustomer(user);
  const stripe = getStripe();
  const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL?.trim() || `${appBaseUrl()}/profile`;

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return res.json({ url: portal.url });
});

billingRouter.get("/sync-session", async (req, res) => {
  const user = await requireAuthUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const sessionId = String(req.query.session_id || "").trim();
  if (!sessionId || !(await stripeConfigured())) {
    return res.json({ user: authUserPayload(user) });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (
    session.payment_status === "paid" &&
    session.metadata?.userId === user.id &&
    session.subscription
  ) {
    const subId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;
    await activatePremiumFromStripe(user.id, subId, true);
  }

  const updated = await prisma.user.findUnique({ where: { id: user.id } });
  return res.json({ user: authUserPayload(updated || user) });
});

/** Stripe webhook — mount with express.raw on this path in app.ts */
export async function handleStripeWebhook(
  req: import("express").Request,
  res: import("express").Response,
) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return res.status(503).json({ error: "STRIPE_WEBHOOK_SECRET not configured" });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    return res.status(400).json({ error: "Missing stripe-signature" });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return res.status(400).json({ error: msg });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = await resolveUserIdFromStripeEvent(session);
        if (userId && session.mode === "subscription") {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id ?? null;
          await activatePremiumFromStripe(userId, subId, true);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdFromStripeEvent(sub);
        if (userId) {
          const active = sub.status === "active" || sub.status === "trialing";
          await activatePremiumFromStripe(userId, sub.id, active);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdFromStripeEvent(sub);
        if (userId) await activatePremiumFromStripe(userId, null, false);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[stripe webhook]", event.type, e);
    return res.status(500).json({ error: "Webhook handler failed" });
  }

  return res.json({ received: true });
}

