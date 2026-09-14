# Headless WooCommerce Commerce

A reference implementation in which WordPress and WooCommerce remain authoritative while a Next.js storefront delivers the customer experience.

Phases 1 through 3 include:

- a pinned, containerized WordPress, WooCommerce, WPGraphQL, and MySQL stack;
- an idempotent WP-CLI seed command for four synthetic products and two field notes;
- a custom WordPress editorial type with revisions and GraphQL support;
- a server-rendered, responsive Next.js catalog and editorial journey;
- expiring signed draft previews, bounded upstream requests, health checks, and structured request logs; and
- a rebuildable Meilisearch catalog projection with URL-addressable facets and authoritative fallback;
- Redis-backed, seven-day cart sessions with HttpOnly identifiers and WooCommerce price and availability revalidation;
- fingerprint-based projection drift detection, an operations-secret-protected rebuild path, and dependency readiness reporting; and
- durable idempotent checkout commands that create pending WooCommerce orders and reserve stock;
- a deterministic signed payment simulator plus an optional Stripe test-mode adapter;
- replay-safe payment callbacks, WooCommerce-native stock reduction and release, and an order support timeline;
- correlated storefront, gateway, authority, and projection logs plus protected operational metrics;
- customer and operator WooCommerce email captured by local Mailpit; and
- static checks plus running-stack contracts covering projections, carts, checkout retries, payment outcomes, email, and final-unit contention.

All catalog, customer, order, and editorial data is synthetic. This project does not claim production traffic, merchant adoption, tax correctness, PCI certification, accessibility certification, or warehouse integration.

## Architecture

```text
browser
  |
  v
Next.js storefront :3000
  |-- authoritative GraphQL --> WordPress + WooCommerce :8080 ---> MySQL
  |                              +-- commerce-reference plugin
  |                                  +-- field-note content type
  |                                  +-- paged catalog projection
  |                                  +-- checkout + payment event records
  |                                  +-- WooCommerce orders + stock holds
  |-- validated search --------> Meilisearch
  |-- expiring cart -----------> Redis
  +-- local order email -------> Mailpit :8025

operator rebuild: WooCommerce projection --> Meilisearch + Redis fingerprint
payment callback: signed event --> Next.js --> durable WordPress ingestion
```

WordPress owns editorial publication and revisions. WooCommerce owns products, prices, stock, customers, orders, and payment-related order state. Meilisearch is a disposable read projection; Redis stores expiring cart intent and projection metadata, not authoritative product or order state.

See [architecture](docs/architecture.md), [security](docs/security.md), [operations](docs/operations.md), and [testing](docs/testing.md) for the evidence boundary.

## Local setup

Prerequisites:

- Docker with Compose;
- Node.js 22.22.2 for host-side checks; and
- npm 10 or newer.

```sh
cp .env.example .env
docker compose up --build -d --wait
```

The local storefront is exposed on port `3000`, WordPress on port `8080`, Meilisearch on loopback port `7700`, and Mailpit on loopback port `8025`. The first startup installs WordPress, activates the pinned plugins, and seeds fixtures before the storefront starts.

Build the initial search projection after the stack is healthy:

```sh
npm run projection:rebuild
```

Until the projection is built—or whenever drift or a search outage is detected—the storefront filters the current authoritative WooCommerce response instead of returning stale search documents.

Local WordPress administration uses the synthetic username `commerce-admin` and the password configured in `.env`.

Stop the stack without deleting its data:

```sh
docker compose down
```

Delete local synthetic data and rebuild from the deterministic seed:

```sh
docker compose down --volumes
docker compose up --build -d --wait
```

## Verification

```sh
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run verify:checkout
npm run verify:stack
npm run verify:recovery
npm run benchmark:local
```

`verify:stack` expects the Compose services to be running. It rebuilds and validates the catalog projection, readiness state, authoritative GraphQL contract, Redis cart, authoritative checkout repricing, idempotent retries, successful and failed payment effects, Mailpit delivery, and concurrent attempts to reserve the final unit.

`verify:recovery` additionally exercises a local MySQL authority backup, deliberate synthetic catalog mutation, restore, and search projection rebuild. The operator runbook also defines a candidate plugin compatibility and rollback exercise.

`benchmark:local` records sequential loopback latency for the server-rendered catalog, authoritative GraphQL catalog, and readiness endpoint. Results describe only the measured local Docker Compose run; they are not production capacity or SLO evidence.

## Checkout flow

Add a synthetic product to the cart, open `/cart`, and enter an address ending in `.test`. Checkout creates a pending WooCommerce order, reserves stock for 15 minutes, and redirects to an order page with test payment and cancellation actions plus a durable support timeline.

`PAYMENT_MODE=simulator` is the default and keeps the entire flow local. `PAYMENT_MODE=stripe-test` requires an `sk_test_` key and uses Stripe's test payment method; live keys are rejected. Neither mode stores a card number or CVC. Mailpit captures the resulting local WooCommerce email at `http://localhost:8025`.

## Preview flow

Preview credentials remain server-side. With matching `COMMERCE_PREVIEW_SECRET` values in WordPress and the storefront, generate a ten-minute signed URL:

```sh
set -a
. ./.env
set +a
npm run preview:url -- a-weekend-above-the-tree-line
```

The endpoint verifies the HMAC signature, slug, and expiry before enabling a matching server-side preview session. Neither the shared secret nor the WordPress preview credential appears in the URL. This is local preview groundwork, not a complete editorial SSO integration.

## Current boundary

Phase 4 remains a local, synthetic commerce workflow rather than a production checkout. It excludes validated tax and shipping integrations, promotions, customer accounts, refunds, automated hold expiry, asynchronous reconciliation workers, cloud deployment, and production observability. Stripe support is test mode only, and Mailpit proves local message generation rather than deliverability through a production email provider.
