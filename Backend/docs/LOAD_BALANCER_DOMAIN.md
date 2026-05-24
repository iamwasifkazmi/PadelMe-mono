# Custom domain via Load Balancer (europe-west2)

Cloud Run **domain mappings are not supported** in `europe-west2`. Use a **global external Application Load Balancer** with a **serverless NEG** pointing at `padelme-backend`.

## Quick setup (CLI)

```bash
gcloud auth login
gcloud config set project propane-forge-496410-k5   # or your project ID

cd Backend
chmod +x scripts/setup-api-load-balancer.sh
./scripts/setup-api-load-balancer.sh
```

Defaults: `api.mipadel.co.uk` → `padelme-backend` in `europe-west2`.

Override:

```bash
CUSTOM_DOMAIN=api.mipadel.co.uk ./scripts/setup-api-load-balancer.sh
```

## DNS (registrar)

After the script prints a static IP (e.g. `34.x.x.x`):

| Type | Host | Value |
|------|------|--------|
| **A** | `api` | `<static IP from script>` |

Do **not** use a CNAME to `ghs.googlehosted.com` for this setup — the Application LB uses an **A record** to the reserved global IP.

## Certificate

Google-managed SSL cert (`padelme-api-cert`) stays `PROVISIONING` until DNS resolves to the LB IP, then becomes `ACTIVE`.

```bash
gcloud compute ssl-certificates describe padelme-api-cert --global \
  --format='yaml(name,managed)'
```

## After HTTPS works

1. **Cloud Run env** — `PUBLIC_API_ORIGIN=https://api.mipadel.co.uk` (via `.env` + `./scripts/deploy-cloud-run.sh`).
2. **Stripe** — webhook URL `https://api.mipadel.co.uk/api/billing/webhook`.
3. **App** — `EXPO_PUBLIC_API_URL=https://api.mipadel.co.uk/api` (see `PadelMeApp/src/config/domain.ts`).

Marketing site can stay on `https://mipadel.co.uk` (`APP_PUBLIC_URL`); API/invites use `api.mipadel.co.uk`.

## Console equivalent

[Load balancing](https://console.cloud.google.com/net-services/loadbalancing/list) → **Create load balancer** → Application Load Balancer → **Public facing** → **Global external** → backend: **Serverless NEG** → Cloud Run `padelme-backend` → managed certificate for `api.mipadel.co.uk`.

## Resources created

| Resource | Name (default) |
|----------|----------------|
| Static IP | `padelme-api-ip` |
| Serverless NEG | `padelme-api-neg` |
| Backend service | `padelme-api-backend` |
| URL map | `padelme-api-url-map` |
| SSL cert | `padelme-api-cert-v2` (recreate if DNS was added after first cert failed) |
| HTTPS proxy / FR | `padelme-api-https-proxy`, `padelme-api-https-fr` |
| HTTP redirect | `padelme-api-http-redirect`, `padelme-api-http-fr` |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Cert stuck PROVISIONING | Confirm A record for `api` → LB IP; wait up to 60 min |
| 403 from Cloud Run | Ensure service allows unauthenticated invocations, or grant `roles/run.invoker` to the LB service agent |
| Still using `*.run.app` in app | Set `PUBLIC_API_ORIGIN` / `EXPO_PUBLIC_API_URL` and redeploy |

## Cost note

A global external Application Load Balancer has a small monthly cost (forwarding rules + data processing). Acceptable for production API on an unsupported domain-mapping region.
