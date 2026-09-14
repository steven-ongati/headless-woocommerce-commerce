# Payment callback recovery

## Signal

The operational metrics endpoint reports rejected or pending callbacks, or an order remains pending after a provider callback was expected.

## Triage

1. Record the callback request ID without copying its signature or payload.
2. Inspect `commerce_gateway_request` and `commerce_authority_response` entries with that request ID.
3. Check callback pending age and maximum processing time.
4. Read the order timeline and the durable payment-event row through controlled administrative access.
5. Distinguish invalid signatures, expired signatures, exact replays, conflicting replays, and authority failures.

## Recovery

- Reject invalid, expired, or conflicting deliveries; do not mutate the order manually.
- Treat an exact completed replay as successful idempotent delivery.
- Restore WordPress/MySQL availability before asking the provider to redeliver a callback that never reached durable processing.
- Run `npm run verify:checkout` after recovery and confirm stock changed at most once.

The local simulator has no asynchronous reconciliation worker. A deployed system would require provider event retrieval, retry policy, dead-letter handling, alerting, and a reviewed manual-reconciliation procedure.
