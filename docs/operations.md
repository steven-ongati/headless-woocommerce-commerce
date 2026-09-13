# Operations

## Health model

- MySQL: `mysqladmin ping`.
- WordPress: successful local access to `wp-login.php`.
- Storefront: `GET /api/health` returns service, status, and timestamp.
- Redis: `redis-cli ping`.
- Meilisearch: `GET /health`.
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

## Operator commands

```sh
docker compose ps
docker compose logs --tail=100 storefront wordpress wp-setup redis meilisearch
npm run projection:rebuild
curl -fsS http://localhost:3000/api/readiness | jq
docker compose restart storefront
docker compose down
docker compose down --volumes
```

Removing volumes is destructive only to local synthetic data. The seed command can recreate the reference catalog and field notes.

`projection:rebuild` sends the local operations secret only in a request header. The protected `GET /api/operations/projection` endpoint returns fingerprints, document counts, rebuild time, and `fresh`, `drifted`, `unbuilt`, or `unavailable` status.

## Recovery exercise

1. Start the stack and run `npm run verify:stack`.
2. Stop Meilisearch: `docker compose stop meilisearch`.
3. Reload a filtered catalog URL and confirm authoritative fallback is explicit.
4. Start Meilisearch, change one synthetic product price in WooCommerce, and confirm the next catalog request reports projection drift while showing the current price.
5. Run `npm run projection:rebuild`, then `npm run verify:stack`, and confirm readiness returns to `ready`.
6. Stop WordPress and confirm the catalog renders an explicit unavailable state.
7. Start WordPress and rerun the stack contract.

This exercise demonstrates dependency failure behavior; it is not evidence of a production recovery-time objective.

## Backup boundary

This phase has no production backup policy. MySQL remains the authority requiring backup; Redis carts are disposable session state and Meilisearch is rebuilt from WooCommerce. Production work would still require encrypted authority backups, media backup, restore drills, retention policy, and measured recovery objectives.
