#!/bin/sh

set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

backup="${1:-}"
if [ ! -f "${backup}" ] || [ ! -s "${backup}" ]; then
  printf '%s\n' "Pass a non-empty authority backup file." >&2
  exit 1
fi
if [ "${CONFIRM_SYNTHETIC_RESTORE:-}" != "restore-local-synthetic-data" ]; then
  printf '%s\n' \
    "Set CONFIRM_SYNTHETIC_RESTORE=restore-local-synthetic-data to continue." \
    >&2
  exit 1
fi

docker compose exec -T db sh -c '
  exec mysql \
    --default-character-set=utf8mb4 \
    -uroot \
    -p"$MYSQL_ROOT_PASSWORD" \
    wordpress
' <"${backup}"

docker compose restart wordpress storefront >/dev/null
docker compose up -d --wait >/dev/null
docker compose run --rm --no-deps --entrypoint wp wp-setup cache flush >/dev/null
sh scripts/rebuild-projection.sh >/dev/null
printf '%s\n' "Synthetic authority restored from ${backup}."
