/** Canonical public site (Stripe returns, User-Agent, invite links). */
export const DEFAULT_APP_ORIGIN = "https://mipadel.co.uk";

export function appPublicOrigin(): string {
  const fromEnv =
    process.env.APP_PUBLIC_URL?.trim() || process.env.STRIPE_RETURN_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return DEFAULT_APP_ORIGIN;
}

export function appUserAgent(purpose: string): string {
  return `MiPadel/1.0 (+${appPublicOrigin()}; ${purpose}; contact@mipadel.co.uk)`;
}

export const INVITE_EMAIL_DOMAIN = "invite.mipadel.co.uk";
