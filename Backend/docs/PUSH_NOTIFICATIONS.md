# Push notifications (FCM)

In-app notifications are stored in the `Notification` table. **Push** uses Firebase Cloud Messaging (FCM) project **`mipadel-7463c`**.

## Flow

1. App registers FCM token → `POST /api/notifications/push-token` (JWT).
2. `notifyUser()` creates the inbox row → `sendPushForNotification()` sends FCM.
3. User taps push → app marks read and navigates (match, chat, invite, etc.).

---

## “Key creation is not allowed” (your screenshot)

Many Google accounts have an **organization policy** that blocks **downloading** service account JSON keys (`iam.disableServiceAccountKeyCreation`).

You do **not** need “Generate new private key” if the API runs on **Cloud Run**.

Use **Application Default Credentials** instead:

1. Find your **Cloud Run service account** (GCP → Cloud Run → `padelme-backend` → Security tab), e.g.  
   `779853-compute@developer.gserviceaccount.com` or a custom `...@...iam.gserviceaccount.com`.

2. Open **GCP IAM** for Firebase project **`mipadel-7463c`**:  
   https://console.cloud.google.com/iam-admin/iam?project=mipadel-7463c

3. **Grant access** → add that Cloud Run service account email → role:  
   **Firebase Cloud Messaging Admin** (`roles/firebasecloudmessaging.admin`)  
   (or **Firebase Admin** for broader access).

4. On Cloud Run, set env (no JSON secret):
   ```bash
   FIREBASE_PROJECT_ID=mipadel-7463c
   ```

5. Redeploy the backend. Push init will log:  
   `[push] Firebase Admin using Application Default Credentials`

### Optional: allow JSON keys (org admin only)

If you need keys for **local** dev, an org admin must relax the policy or create a key for you in **IAM → Service accounts → Keys**. Not required for production on Cloud Run.

---

## Backend env

| Variable | Required | Purpose |
|----------|----------|---------|
| `FIREBASE_PROJECT_ID` | On Cloud Run | `mipadel-7463c` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional | Only if ADC is not used (local dev with a key) |

After schema change:

```bash
cd Backend
npx prisma migrate deploy
```

## Firebase / app (already in repo)

- iOS: `PadelMeApp/ios/PadelMeApp/GoogleService-Info.plist`
- Android: `PadelMeApp/android/app/google-services.json`
- APNs `.p8` uploaded in Firebase → Cloud Messaging → Apple

## Deploy checklist

- [ ] `PushDevice` migration applied
- [ ] Cloud Run SA has **Firebase Cloud Messaging Admin** on `mipadel-7463c`
- [ ] `FIREBASE_PROJECT_ID=mipadel-7463c` on Cloud Run
- [ ] App rebuilt on a **physical iPhone** (simulator does not receive push)
- [ ] Release iOS: entitlements `aps-environment` → `production` for App Store

## API

| Method | Path | Auth | Body |
|--------|------|------|------|
| POST | `/api/notifications/push-token` | Bearer | `{ token, platform: "ios" \| "android" }` |
| POST | `/api/notifications/push-token/unregister` | Bearer | `{ token }` |
