#!/usr/bin/env bash
# Deploy Backend to Cloud Run from this directory's parent (Backend/).
# - Builds with Dockerfile via Cloud Build (--source).
# - Merges Google Sign-In env (does not remove your existing DATABASE_URL, JWT_SECRET, etc.).
#
# Prereqs: gcloud CLI, project with Cloud Run + Cloud Build API, permission to deploy.
#
# Usage (from repo root or Backend/):
#   ./scripts/deploy-cloud-run.sh
# Optional env overrides:
#   GCP_PROJECT=your-project CLOUD_RUN_SERVICE=padelme-backend CLOUD_RUN_REGION=europe-west2 ./scripts/deploy-cloud-run.sh
# To skip merging OAuth-related env vars (Google + Apple) after deploy:
#   SKIP_GOOGLE_ENV=1 ./scripts/deploy-cloud-run.sh
# (or SKIP_OAUTH_ENV=1)
#
# Keep GOOGLE_OAUTH_CLIENT_IDS in sync with PadelMeApp/src/config/googleSignIn.ts.
# APPLE_CLIENT_ID must match the iOS bundle ID (PadelMeApp Xcode / appleAuth.ts), default com.mipadel.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_ROOT"

PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "Error: No GCP project. Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

SERVICE="${CLOUD_RUN_SERVICE:-padelme-backend}"
REGION="${CLOUD_RUN_REGION:-europe-west2}"

# Public OAuth client IDs (same as mobile app googleSignIn.ts — not secrets).
DEFAULT_GOOGLE_OAUTH_CLIENT_IDS="${GOOGLE_OAUTH_CLIENT_IDS:-775252415773-g3l6i0uvfpbi0tkl1o133v9dhe15o221.apps.googleusercontent.com,775252415773-9j5drsnrenjmgmvvlbpimr7k7o6qp5kp.apps.googleusercontent.com}"

echo "==> Project: $PROJECT"
echo "==> Service: $SERVICE  Region: $REGION"
echo "==> Deploying from $BACKEND_ROOT (Dockerfile build)..."

gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --source=. \
  --platform=managed \
  --quiet

echo "==> Deploy finished."

if [[ "${SKIP_GOOGLE_ENV:-}" == "1" || "${SKIP_OAUTH_ENV:-}" == "1" ]]; then
  echo "==> SKIP_GOOGLE_ENV or SKIP_OAUTH_ENV set — not updating Cloud Run env vars."
  exit 0
fi

DEFAULT_APPLE_CLIENT_ID="${APPLE_CLIENT_ID:-com.mipadel}"

echo "==> Merging GOOGLE_OAUTH_CLIENT_IDS and APPLE_CLIENT_ID (existing env vars are preserved)..."

gcloud run services update "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --update-env-vars="^|^GOOGLE_OAUTH_CLIENT_IDS=${DEFAULT_GOOGLE_OAUTH_CLIENT_IDS}^|^APPLE_CLIENT_ID=${DEFAULT_APPLE_CLIENT_ID}" \
  --quiet

echo "==> Done. Google: Web+iOS client IDs. Apple: APPLE_CLIENT_ID=${DEFAULT_APPLE_CLIENT_ID}"
