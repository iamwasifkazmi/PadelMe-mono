#!/usr/bin/env bash
# Map api.mipadel.co.uk (or CUSTOM_DOMAIN) → Cloud Run via global external Application LB.
#
# Cloud Run domain mappings are NOT available in europe-west2; this is the supported path.
#
# Prereqs:
#   gcloud auth login
#   Domain mipadel.co.uk verified in Search Console / Cloud Domains for this project
#
# Usage (from Backend/):
#   ./scripts/setup-api-load-balancer.sh
#
# Optional env:
#   GCP_PROJECT=propane-forge-496410-k5
#   CLOUD_RUN_SERVICE=padelme-backend
#   CLOUD_RUN_REGION=europe-west2
#   CUSTOM_DOMAIN=api.mipadel.co.uk
#   LB_PREFIX=padelme-api          # resource name prefix

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "Error: set GCP_PROJECT or run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

SERVICE="${CLOUD_RUN_SERVICE:-padelme-backend}"
REGION="${CLOUD_RUN_REGION:-europe-west2}"
DOMAIN="${CUSTOM_DOMAIN:-api.mipadel.co.uk}"
PREFIX="${LB_PREFIX:-padelme-api}"

NEG="${PREFIX}-neg"
BACKEND="${PREFIX}-backend"
URL_MAP="${PREFIX}-url-map"
HTTP_REDIRECT_MAP="${PREFIX}-http-redirect"
# v2: recreated after DNS is live if the first cert failed provisioning
CERT="${LB_SSL_CERT:-${PREFIX}-cert-v2}"
HTTPS_PROXY="${PREFIX}-https-proxy"
HTTP_PROXY="${PREFIX}-http-proxy"
IP_NAME="${PREFIX}-ip"
HTTPS_FR="${PREFIX}-https-fr"
HTTP_FR="${PREFIX}-http-fr"

GCLOUD=(gcloud --project="$PROJECT")

echo "==> Project:        $PROJECT"
echo "==> Cloud Run:      $SERVICE ($REGION)"
echo "==> Custom domain:  $DOMAIN"
echo "==> LB prefix:      $PREFIX"
echo ""

if ! "${GCLOUD[@]}" auth print-access-token &>/dev/null; then
  echo "Error: gcloud is not authenticated. Run:  gcloud auth login"
  exit 1
fi

echo "==> Enabling APIs (idempotent)..."
"${GCLOUD[@]}" services enable \
  compute.googleapis.com \
  run.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --quiet

echo "==> Verifying Cloud Run service exists..."
"${GCLOUD[@]}" run services describe "$SERVICE" --region="$REGION" --format='value(status.url)' >/dev/null

exists() {
  "${GCLOUD[@]}" "$@" &>/dev/null
}

echo "==> Reserving global static IP (${IP_NAME})..."
if ! exists compute addresses describe "$IP_NAME" --global; then
  "${GCLOUD[@]}" compute addresses create "$IP_NAME" --global --ip-version=IPV4
fi
LB_IP="$("${GCLOUD[@]}" compute addresses describe "$IP_NAME" --global --format='value(address)')"
echo "    Static IP: $LB_IP"

echo "==> Serverless NEG ($NEG) -> $SERVICE"
if ! exists compute network-endpoint-groups describe "$NEG" --region="$REGION"; then
  "${GCLOUD[@]}" compute network-endpoint-groups create "$NEG" \
    --region="$REGION" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$SERVICE"
fi

echo "==> Backend service (${BACKEND})..."
if ! exists compute backend-services describe "$BACKEND" --global; then
  "${GCLOUD[@]}" compute backend-services create "$BACKEND" \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --global \
    --protocol=HTTP
fi

# Re-run safe: skip add-backend if NEG already attached
NEG_URI="projects/${PROJECT}/regions/${REGION}/networkEndpointGroups/${NEG}"
if ! "${GCLOUD[@]}" compute backend-services describe "$BACKEND" --global \
  --format='value(backends[].group)' 2>/dev/null | grep -qF "$NEG_URI"; then
  "${GCLOUD[@]}" compute backend-services add-backend "$BACKEND" \
    --global \
    --network-endpoint-group="$NEG" \
    --network-endpoint-group-region="$REGION"
fi

echo "==> URL map (${URL_MAP})..."
if ! exists compute url-maps describe "$URL_MAP" --global; then
  "${GCLOUD[@]}" compute url-maps create "$URL_MAP" --default-service="$BACKEND" --global
fi

echo "==> Managed SSL certificate (${CERT}) for ${DOMAIN}..."
if ! exists compute ssl-certificates describe "$CERT" --global; then
  "${GCLOUD[@]}" compute ssl-certificates create "$CERT" \
    --domains="$DOMAIN" \
    --global
fi

echo "==> HTTPS proxy + forwarding rule (443)..."
if ! exists compute target-https-proxies describe "$HTTPS_PROXY" --global; then
  "${GCLOUD[@]}" compute target-https-proxies create "$HTTPS_PROXY" \
    --url-map="$URL_MAP" \
    --ssl-certificates="$CERT" \
    --global
fi

if ! exists compute forwarding-rules describe "$HTTPS_FR" --global; then
  "${GCLOUD[@]}" compute forwarding-rules create "$HTTPS_FR" \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --network-tier=PREMIUM \
    --address="$IP_NAME" \
    --target-https-proxy="$HTTPS_PROXY" \
    --global \
    --ports=443
fi

echo "==> HTTP -> HTTPS redirect (port 80)..."
if ! exists compute url-maps describe "$HTTP_REDIRECT_MAP" --global; then
  REDIRECT_YAML="$(mktemp)"
  cat >"$REDIRECT_YAML" <<EOF
name: ${HTTP_REDIRECT_MAP}
defaultUrlRedirect:
  httpsRedirect: true
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
EOF
  "${GCLOUD[@]}" compute url-maps import "$HTTP_REDIRECT_MAP" --global --source="$REDIRECT_YAML"
  rm -f "$REDIRECT_YAML"
fi

if ! exists compute target-http-proxies describe "$HTTP_PROXY" --global; then
  "${GCLOUD[@]}" compute target-http-proxies create "$HTTP_PROXY" \
    --url-map="$HTTP_REDIRECT_MAP" \
    --global
fi

if ! exists compute forwarding-rules describe "$HTTP_FR" --global; then
  "${GCLOUD[@]}" compute forwarding-rules create "$HTTP_FR" \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --network-tier=PREMIUM \
    --address="$IP_NAME" \
    --target-http-proxy="$HTTP_PROXY" \
    --global \
    --ports=80
fi

CERT_STATUS="$("${GCLOUD[@]}" compute ssl-certificates describe "$CERT" --global --format='value(managed.status)' 2>/dev/null || echo 'UNKNOWN')"

echo ""
echo "================================================================================"
echo " Load balancer ready (DNS + cert provisioning may take 15-60 minutes)"
echo "================================================================================"
echo ""
echo "1) At your DNS host for mipadel.co.uk, add:"
echo ""
echo "   Type:  A"
echo "   Name:  api          (hostname: ${DOMAIN})"
echo "   Value: $LB_IP"
echo "   TTL:   300 (or default)"
echo ""
echo "2) Wait for the managed certificate:"
echo "   gcloud compute ssl-certificates describe $CERT --global --format='yaml(managed)'"
echo "   Status should become ACTIVE (needs DNS pointing at $LB_IP first)."
echo ""
echo "3) Test:"
echo "   curl -sI https://${DOMAIN}/health"
echo ""
echo "4) Update production env (Backend/.env -> cloud-run.env.yaml -> deploy):"
echo "   PUBLIC_API_ORIGIN=https://${DOMAIN}"
echo ""
echo "   Stripe webhook: https://${DOMAIN}/api/billing/webhook"
echo "   App: EXPO_PUBLIC_API_URL=https://${DOMAIN}/api"
echo ""
echo "Certificate status now: $CERT_STATUS"
echo "Cloud Run URL (still works): $("${GCLOUD[@]}" run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo "================================================================================"
