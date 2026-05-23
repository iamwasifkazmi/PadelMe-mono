import Stripe from "stripe";
import { prisma } from "./prisma.js";

let stripeClient: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PRICE_ID?.trim());
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export async function ensureStripeCustomer(user: {
  id: string;
  email: string;
  fullName?: string | null;
  stripeCustomerId?: string | null;
}): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.fullName || undefined,
    metadata: { userId: user.id },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export async function activatePremiumFromStripe(
  userId: string,
  subscriptionId: string | null,
  active: boolean,
) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      isSubscribed: active,
      subscriptionSince: active ? new Date() : null,
      stripeSubscriptionId: active ? subscriptionId : null,
    },
  });
}

export async function resolveUserIdFromStripeEvent(
  object: Stripe.Checkout.Session | Stripe.Subscription | Stripe.Invoice,
): Promise<string | null> {
  const metaUserId =
    ("metadata" in object && object.metadata?.userId) ||
    ("subscription_details" in object &&
      object.subscription_details &&
      typeof object.subscription_details === "object" &&
      "metadata" in object.subscription_details &&
      (object.subscription_details as { metadata?: { userId?: string } }).metadata?.userId);

  if (metaUserId) return metaUserId;

  const customerId =
    typeof object.customer === "string"
      ? object.customer
      : object.customer && typeof object.customer === "object" && "id" in object.customer
        ? object.customer.id
        : null;

  if (!customerId) return null;

  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return user?.id ?? null;
}
