import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { buildInviteWebUrl } from "../lib/appDomain.js";
export const invitePublicRouter = Router();
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
invitePublicRouter.get("/invite/:token", async (req, res) => {
    const token = String(req.params.token || "").trim();
    if (!token)
        return res.status(400).send("Missing invite token");
    const invite = await prisma.invite.findUnique({ where: { token } });
    const appUrl = `mipadel://invite/${encodeURIComponent(token)}`;
    const webUrl = buildInviteWebUrl(token);
    let title = "MiPadel invite";
    let subtitle = "Open the app to accept this invite.";
    if (invite?.eventId) {
        const match = await prisma.match.findUnique({ where: { id: invite.eventId } });
        if (match) {
            title = match.title || title;
            subtitle = [match.locationName, match.timeLabel].filter(Boolean).join(" · ") || subtitle;
        }
        else {
            const comp = await prisma.competition.findUnique({ where: { id: invite.eventId } });
            if (comp) {
                title = comp.name || title;
                subtitle = comp.locationName || subtitle;
            }
        }
    }
    if (!invite) {
        return res.status(404).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Invite not found</title></head><body style="font-family:system-ui;padding:24px;text-align:center">
<h1>Invite not found</h1><p>This link may have expired or already been used.</p>
<p><a href="${escapeHtml(appUrl)}">Open MiPadel</a></p></body></html>`);
    }
    const safeTitle = escapeHtml(title);
    const safeSub = escapeHtml(subtitle);
    const safeApp = escapeHtml(appUrl);
    res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${safeTitle} — MiPadel</title>
  <meta http-equiv="refresh" content="0;url=${safeApp}"/>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 32px 20px; background: #0f172a; color: #f8fafc; text-align: center; }
    .card { max-width: 400px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 24px; }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    p { color: #94a3b8; margin: 0 0 20px; font-size: 0.95rem; }
    a.btn { display: inline-block; background: #22c55e; color: #052e16; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px; }
    .muted { margin-top: 16px; font-size: 0.8rem; color: #64748b; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${safeTitle}</h1>
    <p>${safeSub}</p>
    <a class="btn" href="${safeApp}">Open in MiPadel</a>
    <p class="muted">If nothing happens, install MiPadel and tap the button above.<br/>${escapeHtml(webUrl)}</p>
  </div>
</body>
</html>`);
});
/** Universal Links (iOS) — set APPLE_TEAM_ID in env for a valid appID. */
invitePublicRouter.get("/.well-known/apple-app-site-association", (_req, res) => {
    const teamId = process.env.APPLE_TEAM_ID?.trim();
    const bundleId = process.env.APPLE_CLIENT_ID?.trim() || "com.mipadel";
    if (!teamId) {
        return res.type("application/json").json({ applinks: { apps: [], details: [] } });
    }
    return res.type("application/json").json({
        applinks: {
            apps: [],
            details: [{ appID: `${teamId}.${bundleId}`, paths: ["/invite/*"] }],
        },
    });
});
/** Android App Links — set ANDROID_SHA256_CERT in env (release keystore). */
invitePublicRouter.get("/.well-known/assetlinks.json", (_req, res) => {
    const pkg = process.env.ANDROID_PACKAGE_NAME?.trim() || "com.mipadel";
    const sha = process.env.ANDROID_SHA256_CERT?.trim();
    if (!sha) {
        return res.type("application/json").json([]);
    }
    return res.type("application/json").json([
        {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
                namespace: "android_app",
                package_name: pkg,
                sha256_cert_fingerprints: [sha],
            },
        },
    ]);
});
