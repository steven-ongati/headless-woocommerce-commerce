#!/bin/sh

set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

if [ "${CONFIRM_SYNTHETIC_PLUGIN_TEST:-}" != "test-local-plugin-upgrade" ]; then
  printf '%s\n' \
    "Set CONFIRM_SYNTHETIC_PLUGIN_TEST=test-local-plugin-upgrade to continue." \
    >&2
  exit 1
fi

baseline_woocommerce="${WOOCOMMERCE_VERSION:-10.7.0}"
baseline_graphql="${WP_GRAPHQL_VERSION:-2.22.2}"
candidate_woocommerce="${WOOCOMMERCE_CANDIDATE_VERSION:-${baseline_woocommerce}}"
candidate_graphql="${WP_GRAPHQL_CANDIDATE_VERSION:-${baseline_graphql}}"

restore_baseline() {
  WOOCOMMERCE_VERSION="${baseline_woocommerce}" \
    WP_GRAPHQL_VERSION="${baseline_graphql}" \
    docker compose run --rm wp-setup >/dev/null
}
trap restore_baseline EXIT

WOOCOMMERCE_VERSION="${candidate_woocommerce}" \
  WP_GRAPHQL_VERSION="${candidate_graphql}" \
  docker compose run --rm wp-setup >/dev/null

sh scripts/verify-stack.sh
restore_baseline
trap - EXIT
sh scripts/verify-stack.sh

printf '%s\n' \
  "Plugin compatibility verified for WooCommerce ${candidate_woocommerce} and WPGraphQL ${candidate_graphql}; baseline restored."
