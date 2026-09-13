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

wp plugin install woocommerce --version=10.7.0 --activate
wp plugin install wp-graphql --version=2.22.2 --activate
wp plugin activate commerce-reference

wp commerce-reference seed
wp rewrite flush
