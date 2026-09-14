import type { OrderView } from "./checkout-contract";
import { currentRequestId } from "./request-trace";

export type InternalOrder = OrderView & {
  orderId: number;
  paymentIntentId: string;
};

export type PaymentEvent = {
  providerEventId: string;
  paymentIntentId: string;
  type:
    | "payment_intent.succeeded"
    | "payment_intent.payment_failed"
    | "payment_intent.canceled";
  amount: number;
  currency: string;
};

export type AuthorityOperationalMetrics = {
  checkout: {
    total: number;
    pending: number;
    failed: number;
    conflicts: number;
    oldestPendingAgeSeconds: number;
    maxProcessingSeconds: number;
  };
  callbacks: {
    total: number;
    pending: number;
    failed: number;
    oldestPendingAgeSeconds: number;
    maxProcessingSeconds: number;
  };
};

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export async function createAuthoritativeOrder(input: {
  idempotencyKey: string;
  cartId: string;
  email: string;
  lines: Array<{ sku: string; quantity: number }>;
}): Promise<InternalOrder> {
  return gatewayRequest<InternalOrder>("/checkouts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function attachPaymentIntent(
  reference: string,
  cartId: string,
  paymentIntentId: string,
): Promise<InternalOrder> {
  return gatewayRequest<InternalOrder>(
    `/orders/${encodeURIComponent(reference)}/payment`,
    {
      method: "POST",
      body: JSON.stringify({ cartId, paymentIntentId }),
    },
  );
}

export async function getAuthoritativeOrder(
  reference: string,
  cartId: string,
): Promise<InternalOrder> {
  const query = new URLSearchParams({ cartId });
  return gatewayRequest<InternalOrder>(
    `/orders/${encodeURIComponent(reference)}?${query}`,
  );
}

export async function cancelAuthoritativeOrder(
  reference: string,
  cartId: string,
): Promise<InternalOrder> {
  return gatewayRequest<InternalOrder>(
    `/orders/${encodeURIComponent(reference)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ cartId }),
    },
  );
}

export async function deliverPaymentEvent(
  event: PaymentEvent,
): Promise<{ duplicate: boolean; order: InternalOrder }> {
  return gatewayRequest<{ duplicate: boolean; order: InternalOrder }>(
    "/payment-events",
    {
      method: "POST",
      body: JSON.stringify(event),
    },
  );
}

export async function getAuthorityOperationalMetrics(): Promise<AuthorityOperationalMetrics> {
  return gatewayRequest<AuthorityOperationalMetrics>("/operations/metrics");
}

async function gatewayRequest<T extends object>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const endpoint = process.env.WORDPRESS_REST_URL;
  const secret = process.env.COMMERCE_GATEWAY_SECRET;
  if (!endpoint || !secret) {
    throw new GatewayError("The commerce gateway is not configured.", 503);
  }

  const requestId = currentRequestId();
  const startedAt = performance.now();

  try {
    const response = await fetch(`${endpoint}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-commerce-gateway-secret": secret,
        "x-request-id": requestId,
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(7_000),
    });
    const body = (await response.json()) as T | { error?: string };

    console.info(
      JSON.stringify({
        event: "commerce_gateway_request",
        outcome: response.ok ? "ok" : "error",
        requestId,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      }),
    );

    if (!response.ok) {
      const message =
        "error" in body && typeof body.error === "string"
          ? body.error
          : "The authoritative commerce request failed.";
      throw new GatewayError(message, response.status);
    }

    return body as T;
  } catch (error) {
    if (error instanceof GatewayError) {
      throw error;
    }

    console.info(
      JSON.stringify({
        event: "commerce_gateway_request",
        outcome: "error",
        requestId,
        status: 0,
        durationMs: Math.round(performance.now() - startedAt),
      }),
    );
    throw new GatewayError(
      "The authoritative commerce service is unavailable.",
      503,
    );
  }
}
