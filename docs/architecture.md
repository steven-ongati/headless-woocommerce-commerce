# Architecture

## Decision record

### Context

The storefront needs a modern rendering layer without moving commerce authority out of WooCommerce or editorial authority out of WordPress.

### Decision

- WordPress owns field-note content, publication state, and revisions.
- WooCommerce owns products, prices, stock, customers, and orders.
- The `commerce-reference` plugin exposes a deliberately narrow storefront GraphQL projection.
- Next.js performs server-side reads and renders the customer experience.
- Meilisearch holds a disposable, SKU-keyed search projection.
- Redis holds expiring cart intent and the last successful projection fingerprint.
- MySQL remains an implementation detail behind WordPress and WooCommerce.

### Consequences

- The storefront can be replaced without migrating commerce records.
- Catalog requests fail visibly when the authority is unavailable; no stale fixture fallback silently becomes a second authority.
- Search uses Meilisearch only when its recorded fingerprint and document count match WooCommerce. Drift or search failure falls back to the current authoritative response.
- Cart reads and mutations re-fetch WooCommerce products, exposing price and availability changes instead of trusting stored browser or Redis values.
- The projection is purpose-built and smaller than exposing the complete WordPress object graph.
- Checkout work in later phases must perform authoritative price and stock reads.

## Runtime flow

1. Compose waits for MySQL and WordPress health checks.
2. The one-shot `wp-setup` service installs WordPress if needed.
3. WP-CLI installs pinned WooCommerce and WPGraphQL versions.
4. The custom plugin registers `commerce_story`, its GraphQL projection, and the seed command.
5. The seed command upserts fixtures by stable SKU and slug.
6. Redis and Meilisearch pass health checks.
7. The storefront starts only after setup and dependency health gates succeed.
8. An operator rebuild indexes the current GraphQL projection and records its fingerprint in Redis.
9. Each catalog request compares the current authoritative fingerprint before using search.
10. A cart cookie identifies an expiring Redis document; every read and mutation revalidates its SKU lines against WooCommerce.

## Data ownership

| Concern | Authority | Storefront behavior |
| --- | --- | --- |
| Editorial copy and revisions | WordPress | Reads rendered projection |
| Product identity and SKU | WooCommerce | Reads projection |
| Price and currency | WooCommerce | Formats projected decimal |
| Stock status and quantity | WooCommerce | Displays projected availability |
| Search relevance and facets | Disposable Meilisearch projection | Falls back to current WooCommerce data on drift or failure |
| Cart intent | Redis, seven-day expiry | Stores SKU, quantity, and captured display price |
| Presentation and navigation | Next.js | Owns UI composition |
| Draft-mode cookie | Next.js | Enables server-side preview reads |

## Evolution path

Phase 3 can add stock holds, pending orders, idempotent checkout commands, Stripe test payment, durable callbacks, support timelines, and reconciliation. The orchestration store introduced there must record workflow state without replacing WooCommerce order authority.
