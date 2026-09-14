#!/bin/sh

set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

operations_secret="${COMMERCE_OPERATIONS_SECRET:-local-operations-secret-change-before-sharing}"
cookie_jar="$(mktemp)"
trap 'rm -f "${cookie_jar}"' EXIT

storefront_health="$(curl -fsS http://localhost:3000/api/health)"
unauthorized_projection_status="$(
  curl -sS \
    -o /dev/null \
    -w '%{http_code}' \
    http://localhost:3000/api/operations/projection
)"
graphql_response="$(
  curl -fsS \
    -H 'content-type: application/json' \
    --data '{"query":"query StackContract { commerceCatalog(limit: 12) { sku name price currency stockStatus modified } }"}' \
    http://localhost:8080/graphql
)"
projection_rebuild="$(
  curl -fsS \
    -X POST \
    -H "x-operations-secret: ${operations_secret}" \
    http://localhost:3000/api/operations/projection
)"
projection_status="$(
  curl -fsS \
    -H "x-operations-secret: ${operations_secret}" \
    http://localhost:3000/api/operations/projection
)"
readiness="$(curl -fsS http://localhost:3000/api/readiness)"
cart_response="$(
  curl -fsS \
    -c "${cookie_jar}" \
    -H 'content-type: application/json' \
    --data '{"sku":"NS-TRAIL-001"}' \
    http://localhost:3000/api/cart
)"

echo "${storefront_health}" | jq -e '
  .service == "storefront" and
  .status == "ok" and
  (.timestamp | type == "string")
' >/dev/null

test "${unauthorized_projection_status}" = "401"

echo "${graphql_response}" | jq -e '
  (.errors // []) | length == 0
' >/dev/null

echo "${graphql_response}" | jq -e '
  .data.commerceCatalog | length == 4
' >/dev/null

echo "${graphql_response}" | jq -e '
  [.data.commerceCatalog[].sku] | sort == [
    "NS-LIGHT-002",
    "NS-MUG-003",
    "NS-SHELL-004",
    "NS-TRAIL-001"
  ]
' >/dev/null

echo "${graphql_response}" | jq -e '
  all(.data.commerceCatalog[]; (.modified | type == "string") and (.modified | length > 0))
' >/dev/null

echo "${projection_rebuild}" | jq -e '
  .status == "fresh" and
  .authoritativeCount == 4 and
  .projectedCount == 4
' >/dev/null

echo "${projection_status}" | jq -e '
  .status == "fresh" and
  .sourceFingerprint == .projectedFingerprint
' >/dev/null

echo "${readiness}" | jq -e '
  .status == "ready" and
  .dependencies.wordpress == "ready" and
  .dependencies.redis == "ready" and
  .dependencies.projection == "fresh"
' >/dev/null

echo "${cart_response}" | jq -e '
  .itemCount == 1 and
  .lines[0].sku == "NS-TRAIL-001" and
  .lines[0].available == true and
  .lines[0].currentPrice == .lines[0].capturedPrice
' >/dev/null

curl -fsS \
  -b "${cookie_jar}" \
  -X DELETE \
  'http://localhost:3000/api/cart?sku=NS-TRAIL-001' \
  >/dev/null

sh scripts/verify-checkout.sh

metrics="$(
  curl -fsS \
    -H "x-operations-secret: ${operations_secret}" \
    -H 'x-request-id: stack_contract_trace' \
    http://localhost:3000/api/operations/metrics
)"
echo "${metrics}" | jq -e '
  (.observedAt | type == "string") and
  .authority.checkout.total > 0 and
  .authority.callbacks.total > 0 and
  .authority.checkout.oldestPendingAgeSeconds >= 0 and
  .authority.callbacks.oldestPendingAgeSeconds >= 0 and
  .projection.lagSeconds >= 0 and
  .redis.activeCarts >= 0 and
  .redis.counters["cart.read.hit"] > 0 and
  .redis.counters["callback.rejected"] >= 2
' >/dev/null

printf '%s\n' "Stack contract verified."
