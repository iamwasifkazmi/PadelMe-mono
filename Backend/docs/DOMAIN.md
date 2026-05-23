# Domain: mipadel.co.uk

Until DNS is configured, production uses **Cloud Run** for API and invite links:

| Use | URL (current) |
|-----|----------------|
| REST API | `https://padelme-backend-781275999853.europe-west2.run.app/api` |
| Invite link (share) | `https://padelme-backend-781275999853.europe-west2.run.app/invite/:token` |
| Invite landing (browser) | Same — opens **Open in MiPadel** → `mipadel://invite/:token` |
| Stripe webhook | `…/api/billing/webhook` |
| Marketing / Stripe returns | `https://mipadel.co.uk` (`APP_PUBLIC_URL`) |

After DNS maps `mipadel.co.uk` → Cloud Run, set `PUBLIC_API_ORIGIN` and app `PRODUCTION_ORIGIN` to `https://mipadel.co.uk`.

## GCP: map custom domain to Cloud Run

1. [Cloud Run](https://console.cloud.google.com/run) → `padelme-backend` → **Manage custom domains**.
2. Add **`mipadel.co.uk`** (and `www` if needed).
3. Add the DNS records your registrar shows (usually CNAME/A at your domain host).
4. Wait for certificate provisioning (HTTPS).

Until DNS is live, the app can temporarily use the Cloud Run URL via `EXPO_PUBLIC_API_URL` in the React Native app.

## Env

```env
APP_PUBLIC_URL=https://mipadel.co.uk
```

Set on Cloud Run via `build-cloud-run-env-yaml.mjs` + deploy script.

## Code references

- Backend default: `Backend/src/lib/appDomain.ts`
- App API base: `PadelMeApp/src/config/domain.ts`
- Local dev API: `EXPO_PUBLIC_API_URL=http://localhost:4000/api`
