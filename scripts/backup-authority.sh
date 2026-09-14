#!/bin/sh

set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

umask 077
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="${1:-artifacts/backups/commerce-authority-${timestamp}.sql}"
output_directory="$(dirname "${output}")"

mkdir -p "${output_directory}"
docker compose exec -T db sh -c '
  exec mysqldump \
    --default-character-set=utf8mb4 \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    --no-tablespaces \
    -uroot \
    -p"$MYSQL_ROOT_PASSWORD" \
    wordpress
' >"${output}"

test -s "${output}"
chmod 600 "${output}"
printf '%s\n' "${output}"
