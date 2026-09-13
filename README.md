# Headless WooCommerce Commerce

A reference implementation in which WordPress and WooCommerce remain authoritative while a Next.js storefront delivers the customer experience.

Phases 1 and 2 include:

- a pinned, containerized WordPress, WooCommerce, WPGraphQL, and MySQL stack;
- an idempotent WP-CLI seed command for four synthetic products and two field notes;
- a custom WordPress editorial type with revisions and GraphQL support;
- a server-rendered, responsive Next.js catalog and editorial journey;
- secret-gated draft previews, bounded upstream requests, health checks, and structured request logs; and
- a rebuildable Meilisearch catalog projection with URL-addressable facets and authoritative fallback;
- Redis-backed, seven-day cart sessions with HttpOnly identifiers and WooCommerce price and availability revalidation;
- fingerprint-based projection drift detection, an operations-secret-protected rebuild path, and dependency readiness reporting; and
- static checks plus a running-stack contract check covering the projection and cart.

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
  |                                  +-- deterministic seed command
  |-- validated search --------> Meilisearch
  +-- expiring cart -----------> Redis

operator rebuild: WooCommerce projection --> Meilisearch + Redis fingerprint
```

WordPress owns editorial publication and revisions. WooCommerce owns products, prices, stock, customers, and orders. Meilisearch is a disposable read projection; Redis stores expiring cart intent and projection metadata, not authoritative product state.

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

The local storefront is exposed on port `3000`, WordPress on port `8080`, and Meilisearch on loopback port `7700`. The first startup installs WordPress, activates the pinned plugins, and seeds fixtures before the storefront starts.

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
npm run verify:stack
```

`verify:stack` expects the Compose services to be running. It rebuilds and validates the catalog projection, readiness state, authoritative GraphQL contract, and a Redis-backed cart write with current WooCommerce price and availability.

## Preview flow

Preview credentials remain server-side. With matching `COMMERCE_PREVIEW_SECRET` values in WordPress and the storefront, an editor integration can request:

```text
/api/preview?secret=<local-secret>&slug=<field-note-slug>
```

The endpoint validates the secret with a timing-safe comparison, validates the slug, enables the framework draft-mode cookie, and redirects without forwarding the credential to WordPress from the browser. This is local preview groundwork, not a complete editorial SSO integration.

## Current boundary

Phase 2 intentionally stops before checkout. It excludes orders, payments, tax validation, promotions, shipping rates, customer accounts, inventory reservations, reconciliation, cloud deployment, and production observability. Cart totals are revalidated display values, not order confirmations; Phase 3 must re-read price and stock again while creating the pending order and stock hold.
