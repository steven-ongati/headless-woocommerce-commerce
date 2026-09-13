# Security boundary

## Implemented controls

- No real credentials or card data are stored in the repository.
- `.env` files, logs, coverage, and test artifacts are ignored.
- Local defaults are explicitly non-deployable.
- WordPress dashboard file editing is disabled.
- Draft preview requires a server-side secret and timing-safe comparison.
- Preview slugs are constrained before redirect construction.
- Preview responses are private and non-cacheable.
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
| Leaked preview link | Secret validation, no-store response, server-only WordPress call | Replace shared secret with short-lived signed editor sessions |
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
| WordPress outage | Deadline, structured error, explicit degraded UI | Add SLOs, alerting, and tested cache policy |
| GraphQL overexposure | Narrow custom projection | Add query complexity controls before public deployment |
| Dependency compromise | Exact pins, lockfile, audit | Add provenance/SBOM and automated update policy |
| Stored editorial markup | WordPress capability model and rendered content pipeline | Add an explicit allowlist if untrusted authors are introduced |

## Deployment caveat

The Compose defaults are for local development. A deployed environment would require managed and rotated secrets, HTTPS, network-isolated Redis and Meilisearch, non-default database credentials, WordPress hardening, authenticated customer ownership, provider webhook registration, tax and shipping authority, automated hold expiry, backup and restore tests, restricted administrative access, query controls, and a reviewed cache strategy.
