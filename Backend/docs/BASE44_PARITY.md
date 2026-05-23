# MiPadel vs Base44 — feature parity (May 2026)

This document tracks alignment between the **Base44 sample** (`sample-code-base44/`) and **MiPadel** (React Native + Express + Prisma).

## Summary

| Area | Base44 | MiPadel | Notes |
|------|--------|---------|--------|
| Matches (create, join, score, chat) | Yes | Yes | Parity |
| Instant play | Yes | Yes | Parity |
| Ratings (post-match) | Yes | Yes | MiPadel: one-time only (stricter) |
| Tournaments & leagues | Yes | Yes | Parity |
| Bracket / standings | Yes | Yes | Bracket UI improved |
| Premium gate | Simulated `is_subscribed` | Stripe + dev fallback | **MiPadel ahead** for real billing |
| Venue search | Internal DB + OSM (client) | Internal + **LTA** + OSM | **MiPadel ahead** (LTA list) |
| ID verification | Base44 file upload | Camera + optional Supabase storage | Parity |
| Admin ID review | Entity CRUD | REST `/api/admin/id-verifications` | Parity |
| Recurring matches | Yes | Yes | Backend + create-match UI |
| Player rating summary | Entity | API + auto-sync | Parity |
| LTA official API | No | No (HTML court finder) | Neither has private LTA API |
| Native push | No | No | Neither |
| Real Stripe | Package only, simulated | Checkout + webhooks | **MiPadel ahead** |

## Implemented in MiPadel (this release)

### Backend

- Admin: `GET/PATCH /api/admin/id-verifications`, test summary routes  
- Auth: `isSubscribed`, `role`, `POST /auth/subscribe` (dev), expanded `/auth/me`  
- Billing: Stripe Checkout, webhook, portal, `seed:stripe`  
- Venues: LTA Padel court finder parser (`ltapadel.org.uk`)  
- Matches: recurring series fields + `POST /matches/:id/generate-recurring`  
- Ratings: `PlayerRatingSummary` sync + `GET /ratings/summary/:email`  
- Verification: Supabase storage optional; `confirm-photo`  
- User: `stripeCustomerId`, `stripeSubscriptionId`  
- League cron: `POST /internal/generate-league-fixtures` (existing, document in `.env.example`)

### App

- Premium: Stripe Checkout in browser; competitions browse without premium, host gated like Base44  
- Venue picker: **LTA** badge and sources  
- Bracket: horizontal `BracketView` on competition detail  
- Profile: admin links for `role === admin`  
- Subscription refresh on Competitions focus  

### Docs

- `Backend/docs/STRIPE_WEBHOOK.md` — webhook setup  
- `Backend/docs/BASE44_PARITY.md` — this file  

## Still not in either product

- **LTA private API** — only public court finder HTML  
- **FCM / push notifications**  
- **Playtomic / court booking** integration  

## Demo accounts

After `npx prisma db seed`:

- `demo.alex@padelme.demo` / `Demo1234!` — **admin + premium**  
- Other demo users: bella, chris, dana  

## Env quick reference

See `Backend/.env.example` for full list. Critical:

- `DATABASE_URL`, `JWT_SECRET`, `SMTP_*`  
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (price ID in `BillingSettings` via `npm run seed:stripe`)  
- `LTA_PADEL_FINDER_ENABLED=1`  
- `STALE_MATCH_CRON_SECRET` + GCP Scheduler for leagues/stale matches  
