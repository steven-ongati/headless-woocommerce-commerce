# Security boundary

## Implemented controls

- No real credentials or card data are stored in the repository.
- `.env` files, logs, coverage, and test artifacts are ignored.
- Local defaults are explicitly non-deployable.
- WordPress dashboard file editing is disabled.
- Draft preview requires a server-side secret and timing-safe comparison.
- Preview slugs are constrained before redirect construction.
- Preview responses are private and non-cacheable.
- Browser requests do not receive the WordPress GraphQL endpoint or preview secret.
- Upstream GraphQL calls use a five-second deadline.
- Structured request logs contain request ID, outcome, and duration only.
- Dependencies use exact versions and the current lockfile audits with zero known vulnerabilities.

## Threat model

| Threat | Current mitigation | Remaining work |
| --- | --- | --- |
| Leaked preview link | Secret validation, no-store response, server-only WordPress call | Replace shared secret with short-lived signed editor sessions |
| Open redirect | Strict slug validation and same-origin URL construction | Add integration coverage |
| Stale or forged browser price | Browser is display-only in Phase 1 | Re-read price and stock during checkout |
| WordPress outage | Deadline, structured error, explicit degraded UI | Add SLOs, alerting, and tested cache policy |
| GraphQL overexposure | Narrow custom projection | Add query complexity controls before public deployment |
| Dependency compromise | Exact pins, lockfile, audit | Add provenance/SBOM and automated update policy |
| Stored editorial markup | WordPress capability model and rendered content pipeline | Add an explicit allowlist if untrusted authors are introduced |

## Deployment caveat

The Compose defaults are for local development. A deployed environment would require managed secrets, HTTPS, a non-default database credential, WordPress hardening, backup and restore tests, restricted administrative access, query controls, and a reviewed cache strategy.
