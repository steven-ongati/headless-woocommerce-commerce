# Testing strategy

## Current checks

| Layer | Command | Evidence |
| --- | --- | --- |
| Dependency graph | `npm audit --audit-level=moderate` | Known advisory check |
| Type safety | `npm run typecheck` | Strict TypeScript compilation |
| Static quality | `npm run lint` | Next.js and TypeScript rules |
| Unit | `npm run test` | Money formatting, deterministic fingerprints, facet filtering, and cart revalidation |
| Production compile | `npm run build` | Next.js standalone output |
| Compose syntax | `docker compose config --quiet` | Resolved configuration parses |
| Runtime contract | `npm run verify:stack` | Health, operations authorization, modified catalog projection, search rebuild/freshness, readiness, and persisted cart revalidation |
| Fault injection | Recovery exercise in `operations.md` | Meilisearch outage fallback, fingerprint drift, and authoritative cart repricing |

## Manual accessibility checklist

- Navigate primary links, field-kit action, and field-note link by keyboard.
- Confirm the skip link becomes visible on focus and moves focus to main content.
- Confirm focus indicators remain visible against paper, green, and clay surfaces.
- Inspect heading hierarchy and landmark names with a screen reader.
- Confirm the degraded catalog message is announced as status.
- Submit text, category, availability, and sort filters and confirm the URL preserves their state.
- Add a product, open the cart, change quantity, and remove it using keyboard controls.
- Confirm price-change and unavailable-item messages are announced without relying on color.
- Confirm the layout remains usable at 200% zoom and a 320 CSS-pixel viewport.
- Confirm reduced-motion preference disables smooth scrolling.

Passing these checks would be evidence for this build, not an accessibility certification.

## Later-phase tests

- Redis outage and cart recovery behavior.
- Projection drift after authoritative price, stock, and catalog changes.
- Cart cookie persistence, expiry, quantity limits, and concurrent updates.
- Browser-level catalog and editorial journeys.
- Checkout command idempotency, authoritative repricing, and timeout ambiguity.
- Payment webhook signature, replay, and reconciliation tests.
