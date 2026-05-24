/** Marketing site (Stripe return URLs, branding). */
export const DEFAULT_APP_ORIGIN = "https://mipadel.co.uk";

/** API + invite share links (Application LB → Cloud Run). */
export const DEFAULT_PUBLIC_API_ORIGIN = "https://api.mipadel.co.uk";

export function appPublicOrigin(): string {
  const fromEnv =
    process.env.APP_PUBLIC_URL?.trim() || process.env.STRIPE_RETURN_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return DEFAULT_APP_ORIGIN;
}

/** Origin for `/api` and `https://…/invite/:token` share links. */
export function publicApiOrigin(): string {
  const fromEnv = process.env.PUBLIC_API_ORIGIN?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return DEFAULT_PUBLIC_API_ORIGIN;
}

export function buildInviteWebUrl(token: string): string {
  return `${publicApiOrigin()}/invite/${encodeURIComponent(token)}`;
}

export function inviteLinkHostnames(): string[] {
  const hosts = new Set<string>();
  for (const origin of [publicApiOrigin(), appPublicOrigin()]) {
    try {
      hosts.add(new URL(origin).hostname);
    } catch {
      /* ignore */
    }
  }
  return [...hosts];
}

export function appUserAgent(purpose: string): string {
  return `MiPadel/1.0 (+${publicApiOrigin()}; ${purpose}; contact@mipadel.co.uk)`;
}

export const INVITE_EMAIL_DOMAIN = "invite.mipadel.co.uk";
