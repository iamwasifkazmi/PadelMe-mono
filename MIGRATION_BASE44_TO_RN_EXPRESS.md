# Base44 to React Native + Express Migration Blueprint

This document extracts the current `sample-code-base44` app structure so it can be rebuilt in:

- `PadelMeApp` (React Native CLI frontend)
- `Backend` (Express.js + Node.js + Prisma + Supabase Postgres)

## 1) UI Extraction (Web Routes -> RN Screens)

Source routes from `sample-code-base44/src/App.jsx`.

### Core tab flow (inside main layout)

- `/` -> `Home`
- `/find-match` -> `FindMatch` (discover and filters)
- `/messages` -> `Messages` (conversation list)
- `/profile` -> `Profile`

Bottom action sheet opens flows:
- create match
- create competition
- instant play

### Additional in-layout screens

- `/create-match` -> `CreateMatch`
- `/match/:id` -> `MatchDetail`
- `/edit-profile` -> `EditProfile`
- `/notifications` -> `Notifications`
- `/competitions` -> `Competitions`
- `/create-competition` -> `CreateCompetition`
- `/competition/:id` -> `CompetitionDetail`
- `/invite` -> `InvitePlayers`
- `/verification` -> `Verification`
- `/admin/id-review` -> `AdminIDReview`
- `/admin/test` -> `AdminTestMode` (dev/admin utility)
- `/instant-play` -> `InstantPlay`
- `/players` -> `Players`
- `/player/:id` -> `PlayerProfile`
- `/friends` -> `Friends`
- `/past-events` -> `PastEvents`

### Full-screen flows (outside layout)

- `/onboarding` -> `Onboarding`
- `/accept-invite` -> `AcceptInvite`
- `/conversation/:id` -> `ConversationView`
- `/chat/:matchId` -> `Chat` (match-specific chat)

### RN Navigation recommendation

- Root Stack:
  - `AuthLoading` / `Onboarding`
  - `MainTabs`
  - modal stack screens (`CreateMatch`, `CreateCompetition`, `InstantPlay`, `InvitePlayers`, etc.)
- MainTabs:
  - `HomeTab`
  - `DiscoverTab`
  - `MessagesTab`
  - `ProfileTab`
- Extra nested stacks:
  - Match stack (`MatchDetail`, score submission/validation modals)
  - Competition stack (`CompetitionDetail`, bracket, standings)

## 2) Data Model Extraction (Base44 Entities)

Entities found in `sample-code-base44/base44/entities`.

## Core domain

- `User`
- `Match`
- `Competition`
- `CompetitionMatch`
- `CompetitionEntry`
- `Venue`
- `Invite`
- `FriendRequest`
- `BlockedUser`

## Communication + social

- `Conversation`
- `Message`
- `ChatMessage` (match chat)
- `Notification`
- `UserStatus`
- `ConnectedDevice`

## Ratings + stats

- `Rating`
- `PlayerStats`
- `PlayerRecentForm`
- `PlayerRatingSummary`
- `GroupStandings`
- `StatsAuditLog`
- `ScoreAuditLog`

## Availability + instant

- `AvailabilityPost`
- `AvailabilityComment`
- `InstantPlayRequest`

## Optional analytics/system

- `PerformanceSession`
- `IDVerification`

## 3) High-Priority Prisma Models (first migration pass)

Implement these first in `Backend/prisma/schema.prisma`:

- `User`
- `Match`
- `Competition`
- `CompetitionMatch`
- `FriendRequest`
- `Notification`
- `Conversation`
- `Message`
- `ChatMessage`
- `Rating`
- `PlayerStats`
- `PlayerRecentForm`
- `PlayerRatingSummary`
- `GroupStandings`
- `InstantPlayRequest`
- `Invite`
- `IDVerification`

Keep extensible JSON fields for complex structures initially:
- `match_history`
- recurrence pattern
- unread counts map
- tags arrays

Then normalize later if needed.

## 4) API Surface Extraction (Express endpoints to recreate)

The web app currently uses `base44.entities.*` CRUD + `base44.functions.invoke(...)`.
In Express, convert to explicit REST endpoints.

## Auth + profile

- `POST /auth/login` (Supabase auth token exchange)
- `GET /auth/me`
- `PATCH /users/me`
- `GET /users/:id`
- `GET /users` (filters for discover)

## Matches

- `POST /matches`
- `GET /matches` (status/date/skill/location filters)
- `GET /matches/:id`
- `PATCH /matches/:id`
- `POST /matches/:id/join`
- `POST /matches/:id/leave`
- `POST /matches/:id/lock-teams`
- `POST /matches/:id/start`
- `POST /matches/:id/submit-score`
- `POST /matches/:id/validate-score`
- `POST /matches/:id/dispute-score`

## Recurring matches

- `POST /matches/:id/generate-recurring`
  - from function: `generateRecurringMatches`

## Competitions + bracket

- `POST /competitions`
- `GET /competitions`
- `GET /competitions/:id`
- `PATCH /competitions/:id`
- `POST /competitions/:id/join`
- `GET /competitions/:id/matches`
- `POST /competitions/:id/advance-bracket`
  - from function: `advanceBracket`

## Ratings + stats

- `POST /ratings`
- `GET /ratings?rated_email=...`
- `POST /ratings/:ratedEmail/recompute-summary`
  - from function: `updateRatingSummary`
- `POST /stats/update-after-match`
  - from function: `updatePlayerStats`
- `POST /stats/recalculate`
  - from function: `recalculatePlayerStats`

## Messaging

- `GET /conversations`
- `POST /conversations`
- `GET /conversations/:id/messages`
- `POST /conversations/:id/messages`
- `POST /conversations/:id/mark-read`
- `GET /matches/:id/chat-messages`
- `POST /matches/:id/chat-messages`

## Social graph

- `POST /friends/requests`
- `PATCH /friends/requests/:id` (accept/decline/cancel)
- `GET /friends/requests`
- `POST /blocks`
- `DELETE /blocks/:id`

## Notifications

- `GET /notifications`
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`
- `DELETE /notifications/:id`

## Verification

- `POST /verifications/id`
- `GET /admin/verifications/id`
- `PATCH /admin/verifications/id/:id`

## Instant play (critical custom logic)

Mapped from function `instantPlayMatch` actions:

- `POST /instant-play/join` (action: join)
- `POST /instant-play/join-match` (action: join_match)
- `GET /instant-play/status/:requestId` (action: status)
- `POST /instant-play/cancel` (action: cancel)
- `POST /instant-play/confirm` (action: confirm)
- `POST /instant-play/decline` (action: decline)

## Recommendations

- `POST /recommendations/players`
  - from function: `getRecommendedUsers`

## 5) Important Business Logic to Port Exactly

From Base44 functions and UI flows:

- Elo update algorithm (`K_FACTOR=32`, expected score formula)
- PlayerStats upsert and audit log creation
- PlayerRecentForm rolling history cap (10 entries)
- Competition/group standings points updates
- Bracket auto-advance after all round matches are confirmed
- Instant Play matching:
  - skill similarity
  - location distance checks (haversine)
  - dynamic match creation
  - request lifecycle (`waiting`, `matched`, `confirmed`, `declined`, `expired`)
- Recurring match generation with end rules (`never`, `on_date`, `after_count`)

## 6) Suggested Backend Folder Structure

Create new `Backend` folder:

- `Backend/src/app.ts`
- `Backend/src/server.ts`
- `Backend/src/config/`
- `Backend/src/modules/auth/`
- `Backend/src/modules/users/`
- `Backend/src/modules/matches/`
- `Backend/src/modules/competitions/`
- `Backend/src/modules/messages/`
- `Backend/src/modules/notifications/`
- `Backend/src/modules/friends/`
- `Backend/src/modules/ratings/`
- `Backend/src/modules/stats/`
- `Backend/src/modules/instant-play/`
- `Backend/src/modules/recommendations/`
- `Backend/src/modules/admin/`
- `Backend/src/lib/prisma.ts`
- `Backend/prisma/schema.prisma`
- `Backend/prisma/migrations/`

## 7) Frontend Migration Notes for `PadelMeApp`

Current `PadelMeApp` is still the default RN starter template.

Immediate next steps:

1. Add navigation (`@react-navigation/native`, stack + bottom-tabs)
2. Add API layer (`axios` client, auth interceptor)
3. Add query caching (`@tanstack/react-query`)
4. Build screen skeletons first using route list above
5. Port each feature module one-by-one:
   - auth/onboarding
   - matches
   - instant play
   - competitions
   - messaging
   - profile/friends/notifications

## 8) Recommended Build Order

1. Backend auth + user + match CRUD
2. RN auth + tabs + home/discover/list APIs
3. Match detail + join/leave + score flows
4. Competition + bracket + standings
5. Messaging + notifications
6. Ratings/stats/recommendations
7. Instant play advanced flow

---

If you want, next step I can generate:

- initial Prisma schema (`Backend/prisma/schema.prisma`) from these extracted entities
- Express route stubs + controllers
- RN folder architecture + navigation skeleton in `PadelMeApp`

