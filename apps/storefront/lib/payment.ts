import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import type { OrderView } from "./checkout-contract";
import type {
  InternalOrder,
  PaymentEvent,
} from "./wordpress-gateway";
import {
  attachPaymentIntent,
  deliverPaymentEvent,
} from "./wordpress-gateway";

type PaymentIntent = {
  id: string;
  status: string;
  amount: number;
  currency: string;
};

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: PaymentIntent;
  };
};

export type PaymentMode = "simulator" | "stripe-test";

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export async function preparePayment(
  order: InternalOrder,
  cartId: string,
  idempotencyKey: string,
): Promise<{ order: InternalOrder; mode: PaymentMode }> {
  const mode = paymentMode();
  if (order.paymentIntentId) {
    return { order, mode };
  }

  const intent =
    mode === "stripe-test"
      ? await createStripeIntent(order, idempotencyKey)
      : simulatedIntent(
          order,
          `pi_sim_${createHash("sha256")
            .update(idempotencyKey)
            .digest("hex")
            .slice(0, 32)}`,
        );
  const attached = await attachPaymentIntent(
    order.reference,
    cartId,
    intent.id,
  );

  return { order: attached, mode };
}

export async function confirmPayment(
  order: InternalOrder,
): Promise<{ order: InternalOrder; mode: PaymentMode }> {
  if (!order.paymentIntentId) {
    throw new PaymentError("The order has no payment intent.", 409);
  }

  const mode = paymentMode();
  const intent =
    mode === "stripe-test"
      ? await confirmStripeIntent(order.paymentIntentId)
      : simulatedIntent(order, order.paymentIntentId);

  if (intent.status !== "succeeded") {
    throw new PaymentError(
      `The test payment returned ${intent.status}.`,
      409,
    );
  }

  const delivered =
    mode === "simulator"
      ? await deliverSimulatedWebhook(intent)
      : await deliverPaymentEvent(
          paymentEventFromIntent(intent, `sync_${intent.id}`),
        );

  return { order: delivered.order, mode };
}

async function deliverSimulatedWebhook(
  intent: PaymentIntent,
): Promise<{ duplicate: boolean; order: InternalOrder }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new PaymentError(
      "The local payment callback is not configured.",
      503,
    );
  }

  const payload = JSON.stringify({
    id: `evt_sim_${intent.id}`,
    type: "payment_intent.succeeded",
    data: { object: intent },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const event = parseSignedStripeEvent(
    payload,
    `t=${timestamp},v1=${digest}`,
    timestamp,
  );

  return deliverPaymentEvent(paymentEventFromStripeEvent(event));
}

export async function processStripeWebhook(
  payload: string,
  signature: string,
): Promise<{ duplicate: boolean; order: InternalOrder }> {
  const event = parseSignedStripeEvent(payload, signature);
  return deliverPaymentEvent(paymentEventFromStripeEvent(event));
}

export function parseSignedStripeEvent(
  payload: string,
  signature: string,
  now = Math.floor(Date.now() / 1000),
): StripeEvent {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new PaymentError("Stripe webhook verification is not configured.", 503);
  }

  const parts = signature.split(",").map((part) => part.trim());
  const timestamp = parts
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) {
    throw new PaymentError("The Stripe signature is invalid.", 400);
  }

  const eventTime = Number(timestamp);
  if (Math.abs(now - eventTime) > 300) {
    throw new PaymentError("The Stripe signature has expired.", 400);
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const valid = signatures.some((candidate) =>
    safeEqual(candidate, expected),
  );
  if (!valid) {
    throw new PaymentError("The Stripe signature is invalid.", 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    throw new PaymentError("The Stripe event body is invalid.", 400);
  }

  paymentEventFromStripeEvent(event);
  return event;
}

export function publicOrder(order: InternalOrder): OrderView {
  return {
    reference: order.reference,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    email: order.email,
    holdExpiresAt: order.holdExpiresAt,
    items: order.items,
    timeline: order.timeline,
  };
}

function paymentMode(): PaymentMode {
  if (process.env.PAYMENT_MODE === "stripe-test") {
    if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
      throw new PaymentError(
        "Stripe test mode requires an sk_test_ secret.",
        503,
      );
    }
    return "stripe-test";
  }

  return "simulator";
}

function simulatedIntent(
  order: InternalOrder,
  existingId: string,
): PaymentIntent {
  return {
    id: existingId,
    status: "succeeded",
    amount: decimalToMinorUnits(order.amount),
    currency: order.currency.toLowerCase(),
  };
}

async function createStripeIntent(
  order: InternalOrder,
  idempotencyKey: string,
): Promise<PaymentIntent> {
  const body = new URLSearchParams({
    amount: String(decimalToMinorUnits(order.amount)),
    currency: order.currency.toLowerCase(),
    "payment_method_types[]": "card",
    "metadata[commerce_order_id]": String(order.orderId),
    "metadata[commerce_reference]": order.reference,
  });

  return stripeRequest<PaymentIntent>("/v1/payment_intents", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": `checkout-${idempotencyKey}`,
    },
    body,
  });
}

async function confirmStripeIntent(
  paymentIntentId: string,
): Promise<PaymentIntent> {
  const body = new URLSearchParams({
    payment_method: "pm_card_visa",
  });

  return stripeRequest<PaymentIntent>(
    `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}/confirm`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": `confirm-${paymentIntentId}`,
      },
      body,
    },
  );
}

async function stripeRequest<T extends object>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret?.startsWith("sk_test_")) {
    throw new PaymentError("Stripe test mode is not configured.", 503);
  }

  const response = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${secret}`,
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(7_000),
  });
  const body = (await response.json()) as T | {
    error?: { message?: string };
  };

  if (!response.ok) {
    const message =
      "error" in body && body.error?.message
        ? body.error.message
        : "Stripe test mode returned an error.";
    throw new PaymentError(message, response.status);
  }

  return body as T;
}

function paymentEventFromStripeEvent(event: StripeEvent): PaymentEvent {
  if (
    !event ||
    typeof event.id !== "string" ||
    !event.data ||
    !event.data.object
  ) {
    throw new PaymentError("The Stripe event shape is invalid.", 400);
  }

  return paymentEventFromIntent(
    event.data.object,
    event.id,
    event.type,
  );
}

function paymentEventFromIntent(
  intent: PaymentIntent,
  providerEventId: string,
  eventType = "payment_intent.succeeded",
): PaymentEvent {
  if (
    ![
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "payment_intent.canceled",
    ].includes(eventType)
  ) {
    throw new PaymentError("The Stripe event type is unsupported.", 400);
  }
  if (
    typeof intent.id !== "string" ||
    !Number.isInteger(intent.amount) ||
    typeof intent.currency !== "string"
  ) {
    throw new PaymentError("The payment intent shape is invalid.", 400);
  }

  return {
    providerEventId,
    paymentIntentId: intent.id,
    type: eventType as PaymentEvent["type"],
    amount: intent.amount,
    currency: intent.currency,
  };
}

function decimalToMinorUnits(value: string): number {
  if (!/^\d+\.\d{2}$/.test(value)) {
    throw new PaymentError("The authoritative order amount is invalid.", 500);
  }

  return Math.round(Number(value) * 100);
}

function safeEqual(left: string, right: string): boolean {
  if (
    !/^[a-f0-9]{64}$/i.test(left) ||
    left.length !== right.length
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(left, "hex"),
    Buffer.from(right, "hex"),
  );
}
