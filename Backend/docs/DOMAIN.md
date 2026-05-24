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

## GCP: custom domain (`europe-west2`)

**Domain mappings are not available in `europe-west2`** (Console shows: use Load Balancer or Firebase Hosting).

For **`api.mipadel.co.uk`** → use the **Application Load Balancer** script:

```bash
gcloud auth login
cd Backend && ./scripts/setup-api-load-balancer.sh
```

Full steps: [LOAD_BALANCER_DOMAIN.md](./LOAD_BALANCER_DOMAIN.md)

Then set `PUBLIC_API_ORIGIN=https://api.mipadel.co.uk` and add DNS **A** record `api` → static IP from the script.

Until DNS is live, the app can use the Cloud Run URL via `EXPO_PUBLIC_API_URL`.

## Env

```env
APP_PUBLIC_URL=https://mipadel.co.uk
```

Set on Cloud Run via `build-cloud-run-env-yaml.mjs` + deploy script.

## Code references

- Backend default: `Backend/src/lib/appDomain.ts`
- App API base: `PadelMeApp/src/config/domain.ts`
- Local dev API: `EXPO_PUBLIC_API_URL=http://localhost:4000/api`
