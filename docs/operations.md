# Operations

## Health model

- MySQL: `mysqladmin ping`.
- WordPress: successful local access to `wp-login.php`.
- Storefront: `GET /api/health` returns service, status, and timestamp.
- Redis: `redis-cli ping`.
- Meilisearch: `GET /health`.
- Mailpit: `GET /api/v1/info`.
- Readiness: `GET /api/readiness` reports WordPress, Redis, and projection state.
- Setup: the storefront is gated on the successful exit of `wp-setup`.

The storefront health endpoint remains a cheap liveness contract. Readiness can be `degraded` while authoritative catalog rendering still works—for example, before the projection is built or during a Meilisearch outage.

## Structured telemetry

Each WordPress GraphQL request emits one JSON log:

```json
{
  "event": "wordpress_graphql_request",
  "outcome": "ok",
  "requestId": "uuid",
  "durationMs": 24
}
```

No query variables, preview credentials, user content, or response bodies are logged.

Meilisearch requests emit the same request-ID, outcome, HTTP-status, and duration shape under the `catalog_projection_request` event. API keys, filters, documents, and response bodies are not logged.

Private WooCommerce gateway calls emit `commerce_gateway_request` with request ID, outcome, status, and duration. Gateway secrets, buyer payloads, payment payloads, and response bodies are not logged.

## Operator commands

```sh
docker compose ps
docker compose logs --tail=100 storefront wordpress wp-setup redis meilisearch mailpit
npm run projection:rebuild
npm run verify:checkout
npm run authority:backup
npm run verify:recovery
curl -fsS http://localhost:3000/api/readiness | jq
docker compose restart storefront
docker compose down
docker compose down --volumes
```

Removing volumes is destructive only to local synthetic data. The seed command can recreate the reference catalog and field notes.

`projection:rebuild` sends the local operations secret only in a request header. The protected `GET /api/operations/projection` endpoint returns fingerprints, document counts, rebuild time, and `fresh`, `drifted`, `unbuilt`, or `unavailable` status.

Mailpit exposes captured synthetic WooCommerce messages at `http://localhost:8025`. Checkout verification temporarily mutates fixture price and stock, cancels pending verification orders, and restores the deterministic catalog before exit.

## Recovery exercise

1. Start the stack and run `npm run verify:stack`.
2. Stop Meilisearch: `docker compose stop meilisearch`.
3. Reload a filtered catalog URL and confirm authoritative fallback is explicit.
4. Start Meilisearch, change one synthetic product price in WooCommerce, and confirm the next catalog request reports projection drift while showing the current price.
5. Run `npm run projection:rebuild`, then `npm run verify:stack`, and confirm readiness returns to `ready`.
6. Stop WordPress and confirm the catalog renders an explicit unavailable state.
7. Start WordPress and rerun the stack contract.

This exercise demonstrates dependency failure behavior; it is not evidence of a production recovery-time objective.

## Checkout recovery exercise

1. Run `npm run verify:checkout` against the healthy stack.
2. Confirm the same checkout idempotency key returns one order and a changed payload returns `409`.
3. Confirm a successful simulator callback produces one `payment.succeeded` timeline entry after replay and decrements stock once.
4. Confirm a failed callback releases its WooCommerce hold.
5. Confirm two simultaneous reservations for one remaining unit produce one pending order and one conflict.
6. Open Mailpit and confirm WooCommerce generated local customer and operator messages.

The command automates these assertions. It does not exercise provider downtime, asynchronous callback delay, refund handling, or automated reconciliation.

## Authority backup and restore exercise

`npm run authority:backup` writes a mode-`600` MySQL dump under ignored `artifacts/backups`. To restore one:

```sh
CONFIRM_SYNTHETIC_RESTORE=restore-local-synthetic-data \
  npm run authority:restore -- artifacts/backups/<backup>.sql
```

`npm run verify:recovery` backs up the authority, changes one synthetic product, restores the dump, rebuilds the projection, and confirms the authoritative catalog fingerprint returns to its original value.

This is a local synthetic recovery exercise, not a production backup policy or measured recovery objective. A deployed system would still require encrypted off-site authority and media backups, retention and deletion policy, credential separation, scheduled restore drills, and measured recovery-point and recovery-time evidence.

## Pinned plugin upgrade exercise

The setup service accepts candidate versions without changing the committed pins:

```sh
CONFIRM_SYNTHETIC_PLUGIN_TEST=test-local-plugin-upgrade \
WOOCOMMERCE_CANDIDATE_VERSION=<candidate> \
WP_GRAPHQL_CANDIDATE_VERSION=<candidate> \
npm run verify:upgrade
```

The exercise installs the candidates into the local synthetic authority, runs the stack contract, restores the committed baseline versions, and runs the contract again. It is compatibility evidence for the tested pair, not a claim that arbitrary WordPress plugins or future versions are safe.
