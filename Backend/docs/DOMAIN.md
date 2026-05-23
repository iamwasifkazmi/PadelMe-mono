# Domain: mipadel.co.uk

Production uses **`https://mipadel.co.uk`** as the public site and API base:

| Use | URL |
|-----|-----|
| Website / Stripe returns | `https://mipadel.co.uk` |
| REST API | `https://mipadel.co.uk/api` |
| Stripe webhook | `https://mipadel.co.uk/api/billing/webhook` |
| Health check | `https://mipadel.co.uk/health` |

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
