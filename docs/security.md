# Security boundary

## Implemented controls

- No real credentials or card data are stored in the repository.
- `.env` files, logs, coverage, and test artifacts are ignored.
- Local defaults are explicitly non-deployable.
- WordPress dashboard file editing is disabled.
- Draft preview requires a ten-minute HMAC-signed URL and matching expiring server-side session.
- Preview slugs are constrained before redirect construction.
- Preview responses are private and non-cacheable.
- Browser mutations validate `Origin` and Fetch Metadata when the browser supplies them.
- Checkout and order actions have Redis-backed per-cart request budgets.
- Storefront responses set CSP, framing, MIME-sniffing, referrer, browser-feature, and cross-origin isolation headers.
- Projection status and rebuild operations require a separate server-side secret and timing-safe comparison.
- Cart identifiers are opaque UUIDs stored in HttpOnly, SameSite=Lax cookies.
- Redis cart documents expire after seven days and contain synthetic SKU intent, not payment or customer credentials.
- Checkout requires synthetic buyer addresses ending in `.test`.
- The private WordPress commerce gateway requires a separate server-side secret and timing-safe comparison.
- Checkout commands bind an idempotency key to a request hash and reject conflicting reuse.
- Order reads, payment actions, and cancellation require the opaque cart identifier that created the order.
- Stripe mode rejects any secret that does not begin with `sk_test_`.
- Stripe-style webhook signatures use HMAC-SHA256, timing-safe comparison, and a five-minute timestamp window.
- Payment callbacks are claimed durably before order mutation and conflicting replays are rejected.
- No card number, CVC, or browser-supplied order amount is stored.
- Browser requests do not receive the WordPress GraphQL endpoint or preview secret.
- Upstream GraphQL calls use a five-second deadline.
- Structured request logs contain request ID, outcome, and duration only.
- Dependencies use exact versions and the current lockfile audits with zero known vulnerabilities.

## Threat model

| Threat | Current mitigation | Remaining work |
| --- | --- | --- |
| Leaked preview link | Ten-minute signed URL, expiring preview session, no-store response, server-only WordPress call | Replace the signing secret with editor identity and revocable one-time grants |
| Open redirect | Strict slug validation and same-origin URL construction | Add integration coverage |
| Stale or forged browser price | Checkout passes SKU and quantity only; WooCommerce recalculates the order total | Add tax and shipping authority before production |
| Duplicate checkout after timeout | Request-hash-bound idempotency command and deterministic payment identity | Add an operator reconciliation view |
| Oversold final unit | WooCommerce native stock reservation; concurrent contract test | Add automated expiry and multi-node load testing |
| Forged payment callback | Signed payload, bounded timestamp, test-only provider mode | Use provider-managed webhook secret rotation |
| Replayed payment callback | Durable event claim and idempotent WooCommerce transition | Add dead-letter and reconciliation workers |
| Cross-cart order access | Order lookup is bound to the creating cart UUID | Replace with authenticated customer authorization |
| Email data leakage | Synthetic `.test` addresses and loopback-only Mailpit UI | Use a reviewed transactional provider and retention policy |
| Stale search results | Fingerprint and document-count drift detection; authoritative fallback | Add event-driven invalidation and bounded stale-cache policy |
| Cart tampering | Server-owned HttpOnly identifier; quantity and SKU validation; authoritative revalidation | Bind carts to authenticated customers when accounts exist |
| Unauthorized index mutation | Timing-safe operations-secret gate | Replace shared secret with workload identity and an audited operator role |
| Cross-site browser mutation | SameSite cart cookie plus Origin and Fetch Metadata validation | Add authenticated customer CSRF tokens if cookie scope expands |
| Request flooding | Redis-backed per-cart checkout and order-action budgets | Add trusted-edge identity and distributed rate limits before deployment |
| WordPress outage | Deadline, structured error, explicit degraded UI | Add SLOs, alerting, and tested cache policy |
| GraphQL overexposure | Narrow custom projection | Add query complexity controls before public deployment |
| Dependency compromise | Exact pins, lockfile, audit | Add provenance/SBOM and automated update policy |
| Stored editorial markup | WordPress capability model and rendered content pipeline | Add an explicit allowlist if untrusted authors are introduced |

## Deployment caveat

The Compose defaults are for local development. A deployed environment would require managed and rotated secrets, HTTPS, network-isolated Redis and Meilisearch, non-default database credentials, WordPress hardening, authenticated customer ownership, provider webhook registration, tax and shipping authority, automated hold expiry, backup and restore tests, restricted administrative access, query controls, and a reviewed cache strategy.

## Local secret rotation exercise

1. Replace the preview, operations, gateway, Meilisearch, and webhook secrets in `.env` with independently generated values of at least 32 characters.
2. Recreate the affected services with `docker compose up --build -d --force-recreate --wait`.
3. Generate a new preview URL and confirm a URL signed with the previous preview secret is rejected.
4. Confirm the previous operations and gateway secrets return `401`, then run `npm run verify:stack` with the new values.
5. Treat this as local evidence only; a deployed system still needs managed secret versions, dual-key rotation windows, audit records, and emergency revocation.
