#!/bin/sh

set -eu

samples="${BENCHMARK_SAMPLES:-25}"
warmups="${BENCHMARK_WARMUPS:-3}"
case "${samples}:${warmups}" in
  *[!0-9:]*|'':*)
    printf '%s\n' "Benchmark counts must be integers." >&2
    exit 1
    ;;
esac
if [ "${samples}" -lt 5 ] || [ "${samples}" -gt 500 ]; then
  printf '%s\n' "BENCHMARK_SAMPLES must be between 5 and 500." >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="${1:-artifacts/benchmarks/local-${timestamp}.json}"
run_dir="$(mktemp -d)"
trap 'rm -rf "${run_dir}"' EXIT
mkdir -p "$(dirname "${output}")"

request_storefront() {
  curl -fsS -o /dev/null -w '%{time_total}' \
    'http://localhost:3000/?category=Trail&availability=instock'
}

request_graphql() {
  curl -fsS -o /dev/null -w '%{time_total}' \
    -H 'content-type: application/json' \
    --data '{"query":"query BenchmarkCatalog { commerceCatalog(limit: 12) { sku name price stockStatus } }"}' \
    http://localhost:8080/graphql
}

request_readiness() {
  curl -fsS -o /dev/null -w '%{time_total}' \
    http://localhost:3000/api/readiness
}

benchmark_endpoint() {
  name="$1"
  request_function="$2"
  values="${run_dir}/${name}.values"
  result="${run_dir}/${name}.json"

  index=0
  while [ "${index}" -lt "${warmups}" ]; do
    "${request_function}" >/dev/null
    index=$((index + 1))
  done

  index=0
  while [ "${index}" -lt "${samples}" ]; do
    "${request_function}" \
      | awk '{ printf "%.3f\n", $1 * 1000 }' \
      >>"${values}"
    index=$((index + 1))
  done

  sort -n "${values}" >"${values}.sorted"
  p50_index=$(((samples + 1) / 2))
  p95_index=$(((samples * 95 + 99) / 100))
  minimum="$(sed -n '1p' "${values}.sorted")"
  p50="$(sed -n "${p50_index}p" "${values}.sorted")"
  p95="$(sed -n "${p95_index}p" "${values}.sorted")"
  maximum="$(sed -n "${samples}p" "${values}.sorted")"
  average="$(awk '{ total += $1 } END { printf "%.3f", total / NR }' "${values}")"

  jq -n \
    --arg name "${name}" \
    --argjson samples "${samples}" \
    --argjson minimum "${minimum}" \
    --argjson average "${average}" \
    --argjson p50 "${p50}" \
    --argjson p95 "${p95}" \
    --argjson maximum "${maximum}" \
    '{
      name: $name,
      samples: $samples,
      latencyMs: {
        min: $minimum,
        average: $average,
        p50: $p50,
        p95: $p95,
        max: $maximum
      }
    }' >"${result}"
}

benchmark_endpoint storefront_catalog request_storefront
benchmark_endpoint wordpress_graphql request_graphql
benchmark_endpoint storefront_readiness request_readiness

jq -s \
  --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg revision "$(git rev-parse --short HEAD)" \
  --argjson warmups "${warmups}" \
  '{
    generatedAt: $generatedAt,
    revision: $revision,
    environment: "local Docker Compose reference stack",
    methodology: {
      concurrency: 1,
      warmups: $warmups,
      percentileMethod: "nearest-rank",
      transport: "loopback HTTP"
    },
    endpoints: map({ key: .name, value: del(.name) }) | from_entries
  }' \
  "${run_dir}/storefront_catalog.json" \
  "${run_dir}/wordpress_graphql.json" \
  "${run_dir}/storefront_readiness.json" \
  >"${output}"

printf '%s\n' "${output}"
