#!/bin/sh

set -eu

storefront_health="$(curl -fsS http://localhost:3000/api/health)"
graphql_response="$(
  curl -fsS \
    -H 'content-type: application/json' \
    --data '{"query":"query StackContract { commerceCatalog(limit: 12) { sku name price currency stockStatus } }"}' \
    http://localhost:8080/graphql
)"

echo "${storefront_health}" | jq -e '
  .service == "storefront" and
  .status == "ok" and
  (.timestamp | type == "string")
' >/dev/null

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

printf '%s\n' "Stack contract verified."
