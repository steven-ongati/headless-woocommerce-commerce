# Projection drift

## Signal

`GET /api/readiness` reports `degraded`, or the protected projection endpoint reports `drifted`, `unbuilt`, or `unavailable`. The storefront remains on current WooCommerce data and labels the authority fallback.

## Triage

1. Read the protected projection status and record its request ID.
2. Check WordPress, Redis, and Meilisearch health.
3. Compare authoritative and projected counts and fingerprints.
4. Inspect `wordpress_graphql_request`, `catalog_projection_request`, and `commerce_authority_response` logs for the request ID.

## Recovery

1. Restore the failed dependency without deleting MySQL or WordPress volumes.
2. Run `npm run projection:rebuild`.
3. Run `npm run verify:stack`.
4. Confirm readiness is `ready`, fingerprints match, and the storefront reports the projection source.

## Escalation

Do not repeatedly rebuild when the authoritative fingerprint changes during every attempt. Preserve logs and investigate concurrent catalog writes or an unstable WordPress response first.

This runbook covers the local synthetic stack and does not define a production recovery-time objective.
