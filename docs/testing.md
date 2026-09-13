# Testing strategy

## Current checks

| Layer | Command | Evidence |
| --- | --- | --- |
| Dependency graph | `npm audit --audit-level=moderate` | Known advisory check |
| Type safety | `npm run typecheck` | Strict TypeScript compilation |
| Static quality | `npm run lint` | Next.js and TypeScript rules |
| Unit | `npm run test` | Price projection behavior |
| Production compile | `npm run build` | Next.js standalone output |
| Compose syntax | `docker compose config --quiet` | Resolved configuration parses |
| Runtime contract | `npm run verify:stack` | Health and four-product GraphQL projection |

## Manual accessibility checklist

- Navigate primary links, field-kit action, and field-note link by keyboard.
- Confirm the skip link becomes visible on focus and moves focus to main content.
- Confirm focus indicators remain visible against paper, green, and clay surfaces.
- Inspect heading hierarchy and landmark names with a screen reader.
- Confirm the degraded catalog message is announced as status.
- Confirm the layout remains usable at 200% zoom and a 320 CSS-pixel viewport.
- Confirm reduced-motion preference disables smooth scrolling.

Passing these checks would be evidence for this build, not an accessibility certification.

## Later-phase tests

- GraphQL adapter contract fixtures and failure cases.
- Preview authentication and unpublished-content isolation.
- Idempotent seed rerun and clean-volume rebuild.
- WordPress outage and recovery exercise.
- Browser-level catalog and editorial journeys.
- Checkout command idempotency, authoritative repricing, and timeout ambiguity.
- Payment webhook signature, replay, and reconciliation tests.
