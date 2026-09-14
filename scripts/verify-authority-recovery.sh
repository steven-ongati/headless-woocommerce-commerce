#!/bin/sh

set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

backup="$(sh scripts/backup-authority.sh)"
trap 'rm -f "${backup}"' EXIT

catalog_fingerprint() {
  curl -fsS \
    -H 'content-type: application/json' \
    --data '{"query":"query RecoveryContract { commerceCatalog(limit: 12) { sku name price stockStatus } }"}' \
    http://localhost:8080/graphql \
    | jq -cS '.data.commerceCatalog | sort_by(.sku)' \
    | sha256sum \
    | cut -d' ' -f1
}

before="$(catalog_fingerprint)"
docker compose run \
  --rm \
  --no-deps \
  --entrypoint wp \
  wp-setup \
  eval '
    $product_id = wc_get_product_id_by_sku("NS-TRAIL-001");
    wp_update_post([
        "ID" => $product_id,
        "post_title" => "Synthetic recovery mutation",
    ]);
  ' >/dev/null
after_mutation="$(catalog_fingerprint)"
test "${before}" != "${after_mutation}"

CONFIRM_SYNTHETIC_RESTORE=restore-local-synthetic-data \
  sh scripts/restore-authority.sh "${backup}" >/dev/null
after_restore="$(catalog_fingerprint)"
test "${before}" = "${after_restore}"

printf '%s\n' "Authority backup and restore contract verified."
