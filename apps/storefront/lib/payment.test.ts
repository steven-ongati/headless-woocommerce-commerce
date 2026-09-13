import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { parseSignedStripeEvent, PaymentError } from "./payment";

const secret = "whsec_local_signature_test_secret";
const timestamp = 1_800_000_000;
const payload = JSON.stringify({
  id: "evt_test_123",
  type: "payment_intent.succeeded",
  data: {
    object: {
      id: "pi_test_123",
      status: "succeeded",
      amount: 14800,
      currency: "usd",
    },
  },
});

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

describe("parseSignedStripeEvent", () => {
  it("accepts a current matching Stripe signature", () => {
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    const signature = sign(payload, timestamp);

    expect(parseSignedStripeEvent(payload, signature, timestamp)).toMatchObject({
      id: "evt_test_123",
      type: "payment_intent.succeeded",
    });
  });

  it("rejects a mismatched signature", () => {
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    expect(() =>
      parseSignedStripeEvent(
        payload,
        `t=${timestamp},v1=${"0".repeat(64)}`,
        timestamp,
      ),
    ).toThrowError(PaymentError);
  });

  it("rejects an expired signature", () => {
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    expect(() =>
      parseSignedStripeEvent(
        payload,
        sign(payload, timestamp),
        timestamp + 301,
      ),
    ).toThrow("The Stripe signature has expired.");
  });

  it("rejects unsupported payment event types", () => {
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    const unsupported = payload.replace(
      "payment_intent.succeeded",
      "customer.created",
    );

    expect(() =>
      parseSignedStripeEvent(
        unsupported,
        sign(unsupported, timestamp),
        timestamp,
      ),
    ).toThrow("The Stripe event type is unsupported.");
  });
});

function sign(body: string, at: number): string {
  const digest = createHmac("sha256", secret)
    .update(`${at}.${body}`)
    .digest("hex");

  return `t=${at},v1=${digest}`;
}
