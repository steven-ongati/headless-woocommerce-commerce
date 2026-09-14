#!/bin/sh

set -eu

export WP_CLI_CACHE_DIR="/tmp/wp-cli-cache"
mkdir -p "${WP_CLI_CACHE_DIR}"

cd /var/www/html

if ! wp core is-installed 2>/dev/null; then
  wp core install \
    --url="http://localhost:8080" \
    --title="Northstar Supply Co." \
    --admin_user="commerce-admin" \
    --admin_password="${WORDPRESS_ADMIN_PASSWORD}" \
    --admin_email="admin@example.test" \
    --skip-email
fi

wp option update permalink_structure "/%postname%/"
wp option update blogdescription "Synthetic field goods for considered journeys"
wp option update woocommerce_hold_stock_minutes "15"

ensure_plugin_version() {
  plugin="$1"
  version="$2"
  installed_version="$(wp plugin get "${plugin}" --field=version 2>/dev/null || true)"

  if [ "${installed_version}" != "${version}" ]; then
    wp plugin install "${plugin}" --version="${version}" --force --activate
    return
  fi

  wp plugin activate "${plugin}"
}

ensure_plugin_version woocommerce "${WOOCOMMERCE_VERSION:-10.7.0}"
ensure_plugin_version wp-graphql "${WP_GRAPHQL_VERSION:-2.22.2}"
wp plugin activate commerce-reference

wp commerce-reference seed
wp rewrite flush
