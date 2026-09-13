#!/bin/sh

set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

storefront_url="${STOREFRONT_URL:-http://localhost:3000}"
operations_secret="${COMMERCE_OPERATIONS_SECRET:-local-operations-secret-change-before-sharing}"

curl -fsS \
  -X POST \
  -H "x-operations-secret: ${operations_secret}" \
  "${storefront_url}/api/operations/projection"
printf '\n'
