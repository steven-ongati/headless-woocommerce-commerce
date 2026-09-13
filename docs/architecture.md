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
- WooCommerce pending orders and its stock reservation tables hold authoritative checkout state.
- Two plugin-owned tables record retryable checkout commands and payment event processing.
- Next.js owns payment-provider orchestration but not order status or inventory truth.
- Mailpit captures local WooCommerce email without an external delivery dependency.
- MySQL remains an implementation detail behind WordPress and WooCommerce.

### Consequences

- The storefront can be replaced without migrating commerce records.
- Catalog requests fail visibly when the authority is unavailable; no stale fixture fallback silently becomes a second authority.
- Search uses Meilisearch only when its recorded fingerprint and document count match WooCommerce. Drift or search failure falls back to the current authoritative response.
- Cart reads and mutations re-fetch WooCommerce products, exposing price and availability changes instead of trusting stored browser or Redis values.
- Checkout sends SKU and quantity intent only; WooCommerce re-reads products, calculates totals, creates the pending order, and reserves stock.
- Reusing an idempotency key with the same request returns the stored checkout result. Reusing it for another request is rejected.
- Payment events are claimed durably before order mutation, so a replay returns the existing result without a second stock transition.
- The projection is purpose-built and smaller than exposing the complete WordPress object graph.
- The local simulator follows the signed callback path while remaining explicitly distinct from Stripe.

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
11. Checkout claims an idempotency key, creates a pending WooCommerce order, calculates authoritative totals, and reserves stock for 15 minutes.
12. The storefront attaches one deterministic simulator intent or Stripe test PaymentIntent to that order.
13. A signed callback is durably claimed before WooCommerce completes or fails the order.
14. Successful payment reduces stock through WooCommerce and emits order email; failure or cancellation releases the hold.
15. The order page reads the authoritative status and durable support timeline through the private gateway.

## Data ownership

| Concern | Authority | Storefront behavior |
| --- | --- | --- |
| Editorial copy and revisions | WordPress | Reads rendered projection |
| Product identity and SKU | WooCommerce | Reads projection |
| Price and currency | WooCommerce | Formats projected decimal |
| Stock status and quantity | WooCommerce | Displays projected availability |
| Search relevance and facets | Disposable Meilisearch projection | Falls back to current WooCommerce data on drift or failure |
| Cart intent | Redis, seven-day expiry | Stores SKU, quantity, and captured display price |
| Checkout command result | Plugin command table | Provides retry identity; references but does not replace the WooCommerce order |
| Order, total, and payment state | WooCommerce | Creates and reads pending, processing, failed, or cancelled orders |
| Stock hold and reduction | WooCommerce | Uses native reservation, release, and payment-completion behavior |
| Payment callback receipt | Plugin event table | Claims event identity and records processing outcome |
| Local email evidence | WooCommerce + Mailpit | Generates standard order email and captures it locally |
| Presentation and navigation | Next.js | Owns UI composition |
| Draft-mode cookie | Next.js | Enables server-side preview reads |

## Checkout state flow

```text
cart intent
  -> pending order + reserved stock
  -> payment intent attached
  -> processing after successful callback + stock reduced
  -> failed/cancelled after unsuccessful outcome + hold released
```

The support timeline is WooCommerce order metadata intended for debugging and customer support. It is not an event-sourced order authority. A production evolution would add scheduled hold expiry, provider reconciliation, refund workflows, tax and shipping integrations, and measured recovery objectives.
