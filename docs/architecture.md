# Architecture

## Decision record

### Context

The storefront needs a modern rendering layer without moving commerce authority out of WooCommerce or editorial authority out of WordPress.

### Decision

- WordPress owns field-note content, publication state, and revisions.
- WooCommerce owns products, prices, stock, customers, and orders.
- The `commerce-reference` plugin exposes a deliberately narrow storefront GraphQL projection.
- Next.js performs server-side reads and renders the customer experience.
- MySQL remains an implementation detail behind WordPress and WooCommerce.

### Consequences

- The storefront can be replaced without migrating commerce records.
- Catalog requests fail visibly when the authority is unavailable; no stale fixture fallback silently becomes a second authority.
- The projection is purpose-built and smaller than exposing the complete WordPress object graph.
- Checkout work in later phases must perform authoritative price and stock reads.

## Runtime flow

1. Compose waits for MySQL and WordPress health checks.
2. The one-shot `wp-setup` service installs WordPress if needed.
3. WP-CLI installs pinned WooCommerce and WPGraphQL versions.
4. The custom plugin registers `commerce_story`, its GraphQL projection, and the seed command.
5. The seed command upserts fixtures by stable SKU and slug.
6. The storefront starts only after setup exits successfully.
7. Each catalog request queries WordPress GraphQL with a five-second deadline and a request identifier.

## Data ownership

| Concern | Authority | Storefront behavior |
| --- | --- | --- |
| Editorial copy and revisions | WordPress | Reads rendered projection |
| Product identity and SKU | WooCommerce | Reads projection |
| Price and currency | WooCommerce | Formats projected decimal |
| Stock status and quantity | WooCommerce | Displays projected availability |
| Presentation and navigation | Next.js | Owns UI composition |
| Draft-mode cookie | Next.js | Enables server-side preview reads |

## Evolution path

Phase 2 can add cart and checkout orchestration while preserving the authority boundary. A gateway is warranted when commands, idempotency, external payment state, and reconciliation appear; it should not be introduced only to proxy reads.
