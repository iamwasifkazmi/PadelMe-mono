/** Marketing site (Stripe return URLs, branding). */
export const DEFAULT_APP_ORIGIN = "https://mipadel.co.uk";
/** Cloud Run URL — API + invite links until mipadel.co.uk DNS is live. */
export const DEFAULT_PUBLIC_API_ORIGIN = "https://padelme-backend-781275999853.europe-west2.run.app";
export function appPublicOrigin() {
    const fromEnv = process.env.APP_PUBLIC_URL?.trim() || process.env.STRIPE_RETURN_BASE_URL?.trim();
    if (fromEnv)
        return fromEnv.replace(/\/$/, "");
    return DEFAULT_APP_ORIGIN;
}
/** Origin for `/api` and `https://…/invite/:token` share links. */
export function publicApiOrigin() {
    const fromEnv = process.env.PUBLIC_API_ORIGIN?.trim();
    if (fromEnv)
        return fromEnv.replace(/\/$/, "");
    return DEFAULT_PUBLIC_API_ORIGIN;
}
export function buildInviteWebUrl(token) {
    return `${publicApiOrigin()}/invite/${encodeURIComponent(token)}`;
}
export function inviteLinkHostnames() {
    const hosts = new Set();
    for (const origin of [publicApiOrigin(), appPublicOrigin()]) {
        try {
            hosts.add(new URL(origin).hostname);
        }
        catch {
            /* ignore */
        }
    }
    return [...hosts];
}
export function appUserAgent(purpose) {
    return `MiPadel/1.0 (+${publicApiOrigin()}; ${purpose}; contact@mipadel.co.uk)`;
}
export const INVITE_EMAIL_DOMAIN = "invite.mipadel.co.uk";
