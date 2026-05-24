# Stripe webhook setup (MiPadel Premium)

MiPadel uses **Stripe Checkout** for Premium subscriptions. After payment, Stripe notifies the backend via a **webhook** so `User.isSubscribed` is set to `true`.

## Prerequisites

1. **Stripe secret in `Backend/.env`** (never commit this file):

   ```env
   STRIPE_SECRET_KEY=sk_test_...   # or sk_live_... in production
   ```

   Product + Price IDs are stored in the database (`BillingSettings`), not in `.env`:

   ```bash
   cd Backend
   npm run seed:stripe
   # or: npx prisma db seed   (if STRIPE_SECRET_KEY is set)
   ```

2. **Backend deployed** with the same env vars on Cloud Run (see deploy section below).

3. **Public HTTPS URL** for your API (custom domain), e.g.  
   `https://mipadel.co.uk`

---

## 1. Create the webhook in Stripe Dashboard

1. Open [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/test/webhooks) (use **Live** mode for production).
2. Click **Add endpoint**.
3. **Endpoint URL:**

   ```
   https://YOUR-CLOUD-RUN-URL/api/billing/webhook
   ```

   Example:

   ```
   https://api.mipadel.co.uk/api/billing/webhook
   ```

4. **Events to send** — select at least:

   | Event | Purpose |
   |--------|---------|
   | `checkout.session.completed` | User finished Checkout → activate Premium |
   | `customer.subscription.updated` | Plan renewed, paused, etc. |
   | `customer.subscription.deleted` | Cancelled → remove Premium |

5. Click **Add endpoint**.
6. Open the new endpoint → **Signing secret** → Reveal → copy `whsec_...`.

---

## 2. Add signing secret to the backend

**Local (`Backend/.env`):**

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx
```

**Cloud Run** — either:

- Add to `Backend/.env` and redeploy (`./scripts/deploy-cloud-run.sh` merges into `cloud-run.env.yaml`), or  
- GCP Console → Cloud Run → `padelme-backend` → Edit & deploy → Variables → `STRIPE_WEBHOOK_SECRET`

Redeploy after changing env:

```bash
cd Backend
./scripts/deploy-cloud-run.sh
```

---

## 3. Verify the endpoint

### Stripe “Send test webhook”

In the webhook detail page, **Send test event** → `checkout.session.completed`.  
Cloud Run logs should show `200` for `POST /api/billing/webhook`.

### CLI (optional, local dev)

```bash
stripe listen --forward-to localhost:4000/api/billing/webhook
```

Use the `whsec_...` from the CLI output as `STRIPE_WEBHOOK_SECRET` while testing locally.

---

## 4. App flow (what users see)

1. User taps **Start Premium** in the app.
2. App calls `POST /api/billing/checkout-session` (JWT required).
3. Browser opens Stripe Checkout.
4. On success, Stripe calls your webhook → user `isSubscribed = true`.
5. User returns to the app; **Competitions** refreshes subscription on focus.

If the webhook is slow, the app can also call:

```
GET /api/billing/sync-session?session_id=cs_test_...
```

after redirect (optional).

---

## 5. Related API routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/billing/configured` | No | `{ stripe: true }` if secret + price ID set |
| POST | `/api/billing/checkout-session` | Bearer JWT | Returns `{ url, sessionId }` |
| GET | `/api/billing/sync-session?session_id=` | Bearer JWT | Sync premium after checkout |
| POST | `/api/billing/portal-session` | Bearer JWT | Stripe Customer Portal URL |
| POST | `/api/billing/webhook` | Stripe signature | **Do not call manually** |

---

## 6. Premium product (seed)

| Field | Value |
|--------|--------|
| Product name | MiPadel Premium |
| Price | £4.99 / month (GBP) |
| Script | `npm run seed:stripe` |

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Checkout says “Stripe not configured” | Set `STRIPE_SECRET_KEY` on Cloud Run, then run `npm run seed:stripe` against production DB |
| Payment works but no Premium | Webhook missing or wrong `STRIPE_WEBHOOK_SECRET` |
| Webhook returns 400 Invalid signature | Secret mismatch; use the secret from **this** endpoint only |
| Webhook returns 503 | `STRIPE_WEBHOOK_SECRET` not set on the server |

**Important:** The webhook route uses the **raw** request body. Do not put another JSON parser in front of `/api/billing/webhook`.

---

## 8. Auto-renewal vs webhooks

| What | Who handles it |
|------|----------------|
| **Monthly charge** (£4.99) | **Stripe** — automatic on a recurring Price |
| **First Premium in the app** | Webhook `checkout.session.completed` **or** `GET /billing/sync-session` after Checkout |
| **Renewal stays Premium** | Usually no change needed — `isSubscribed` stays `true` |
| **Cancel / card failed** | Webhook `customer.subscription.updated` / `deleted` — **requires `STRIPE_WEBHOOK_SECRET`** |

Without a webhook, users can still **subscribe** (Checkout + `sync-session`), and Stripe still **charges them each month**. Your app may not know if they cancelled in Stripe until you add the webhook.

---

## 9. Production checklist

- [ ] Switch Stripe Dashboard to **Live** mode  
- [ ] Live `STRIPE_SECRET_KEY`, then `npm run seed:stripe` (writes Price ID to DB)  
- [ ] Live webhook endpoint on production Cloud Run URL  
- [ ] `STRIPE_WEBHOOK_SECRET` on Cloud Run  
- [ ] Test one real (small) subscription end-to-end  
