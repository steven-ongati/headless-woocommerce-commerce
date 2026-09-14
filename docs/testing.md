# Testing strategy

## Current checks

| Layer | Command | Evidence |
| --- | --- | --- |
| Dependency graph | `npm audit --audit-level=moderate` | Known advisory check |
| Type safety | `npm run typecheck` | Strict TypeScript compilation |
| Static quality | `npm run lint` | Next.js and TypeScript rules |
| Unit | `npm run test` | Money formatting, deterministic fingerprints, facet filtering, cart revalidation, and payment signature validation |
| Request security | `npm run test` | Preview expiry/signature and cross-origin mutation rejection |
| Production compile | `npm run build` | Next.js standalone output |
| Compose syntax | `docker compose config --quiet` | Resolved configuration parses |
| Checkout contract | `npm run verify:checkout` | Authoritative repricing, idempotency replay/conflict, stock reduction/release, callback replay, Mailpit delivery, and final-unit contention |
| Runtime contract | `npm run verify:stack` | Health, operations authorization, catalog projection, search freshness, readiness, cart revalidation, and the checkout contract |
| Fault injection | Recovery exercise in `operations.md` | Meilisearch outage fallback, fingerprint drift, and authoritative cart repricing |
| Authority recovery | `npm run verify:recovery` | MySQL backup, deliberate synthetic mutation, restore, projection rebuild, and fingerprint equality |
| Plugin compatibility | `npm run verify:upgrade` | Candidate WooCommerce/WPGraphQL contract followed by committed-pin rollback contract |

## Manual accessibility checklist

- Navigate primary links, field-kit action, and field-note link by keyboard.
- Confirm the skip link becomes visible on focus and moves focus to main content.
- Confirm focus indicators remain visible against paper, green, and clay surfaces.
- Inspect heading hierarchy and landmark names with a screen reader.
- Confirm the degraded catalog message is announced as status.
- Submit text, category, availability, and sort filters and confirm the URL preserves their state.
- Add a product, open the cart, change quantity, and remove it using keyboard controls.
- Submit checkout with a `.test` address and confirm focus, validation, pending state, payment action, cancellation action, and timeline remain keyboard accessible.
- Confirm status and error messages are announced without relying on color.
- Confirm price-change and unavailable-item messages are announced without relying on color.
- Confirm the layout remains usable at 200% zoom and a 320 CSS-pixel viewport.
- Confirm reduced-motion preference disables smooth scrolling.

Passing these checks would be evidence for this build, not an accessibility certification.

## Remaining test boundary

- Redis outage and cart recovery behavior.
- Cart cookie persistence, expiry, quantity limits, and concurrent updates.
- Browser-level catalog, editorial, checkout, and order journeys.
- Checkout timeout ambiguity across multiple storefront instances.
- Live Stripe test-webhook delivery and provider outage simulation.
- Automated hold expiry, dead-letter processing, reconciliation, refunds, tax, and shipping.
