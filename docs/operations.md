# Operations

## Health model

- MySQL: `mysqladmin ping`.
- WordPress: successful local access to `wp-login.php`.
- Storefront: `GET /api/health` returns service, status, and timestamp.
- Setup: the storefront is gated on the successful exit of `wp-setup`.

The storefront health endpoint is a liveness contract. It deliberately does not claim WordPress readiness. The running-stack verification checks both services separately.

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

## Operator commands

```sh
docker compose ps
docker compose logs --tail=100 storefront wordpress wp-setup
docker compose restart storefront
docker compose down
docker compose down --volumes
```

Removing volumes is destructive only to local synthetic data. The seed command can recreate the reference catalog and field notes.

## Recovery exercise

1. Start the stack and run `npm run verify:stack`.
2. Stop WordPress: `docker compose stop wordpress`.
3. Reload the storefront and confirm the catalog renders an explicit degraded state.
4. Start WordPress: `docker compose start wordpress`.
5. Run `npm run verify:stack` and confirm recovery.

This exercise demonstrates dependency failure behavior; it is not evidence of a production recovery-time objective.

## Backup boundary

Phase 1 has no production backup policy. The named MySQL volume survives normal container restarts, while deterministic fixtures allow local rebuilds. Production work would require encrypted database backups, media backup, restore drills, retention policy, and measured recovery objectives.
