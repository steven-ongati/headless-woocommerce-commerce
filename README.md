# Headless WooCommerce Commerce

A reference implementation in which WordPress and WooCommerce remain authoritative while a Next.js storefront delivers the customer experience.

Phase 1 includes:

- a pinned, containerized WordPress, WooCommerce, WPGraphQL, and MySQL stack;
- an idempotent WP-CLI seed command for four synthetic products and two field notes;
- a custom WordPress editorial type with revisions and GraphQL support;
- a server-rendered, responsive Next.js catalog and editorial journey;
- secret-gated draft previews, bounded upstream requests, health checks, and structured request logs; and
- static checks plus a running-stack contract check.

All catalog, customer, order, and editorial data is synthetic. This project does not claim production traffic, merchant adoption, tax correctness, PCI certification, accessibility certification, or warehouse integration.

## Architecture

```text
browser
  |
  v
Next.js storefront :3000
  |
  | server-side GraphQL projection
  v
WordPress + WooCommerce :8080  --->  MySQL
  |
  +-- commerce-reference plugin
      +-- field-note content type
      +-- catalog GraphQL projection
      +-- deterministic seed command
```

WordPress owns editorial publication and revisions. WooCommerce owns products, prices, stock, customers, and orders. The storefront renders projections and does not persist a second copy of commerce state.

See [architecture](docs/architecture.md), [security](docs/security.md), [operations](docs/operations.md), and [testing](docs/testing.md) for the evidence boundary.

## Local setup

Prerequisites:

- Docker with Compose;
- Node.js 22.22.2 for host-side checks; and
- npm 10 or newer.

```sh
cp .env.example .env
docker compose up --build
```

The local storefront is exposed on port `3000`; WordPress is exposed on port `8080`. The first startup installs WordPress, activates the pinned plugins, and seeds fixtures before the storefront starts.

Local WordPress administration uses the synthetic username `commerce-admin` and the password configured in `.env`.

Stop the stack without deleting its data:

```sh
docker compose down
```

Delete local synthetic data and rebuild from the deterministic seed:

```sh
docker compose down --volumes
docker compose up --build
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

`verify:stack` expects the Compose services to be running and validates the storefront health contract plus the authoritative GraphQL catalog projection.

## Preview flow

Preview credentials remain server-side. With matching `COMMERCE_PREVIEW_SECRET` values in WordPress and the storefront, an editor integration can request:

```text
/api/preview?secret=<local-secret>&slug=<field-note-slug>
```

The endpoint validates the secret with a timing-safe comparison, validates the slug, enables the framework draft-mode cookie, and redirects without forwarding the credential to WordPress from the browser. This is local preview groundwork, not a complete editorial SSO integration.

## Current boundary

Phase 1 intentionally excludes cart persistence, checkout, payments, tax validation, promotions, shipping rates, customer accounts, search indexing, inventory reservations, reconciliation, cloud deployment, and production observability. Later phases must re-read WooCommerce price and stock at checkout rather than trusting browser state.
