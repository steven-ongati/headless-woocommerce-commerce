import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { clearCart } from "../../../../../lib/cart";
import {
  CART_COOKIE,
  isValidCartId,
} from "../../../../../lib/cart-session";
import {
  confirmPayment,
  PaymentError,
  publicOrder,
} from "../../../../../lib/payment";
import {
  GatewayError,
  getAuthoritativeOrder,
} from "../../../../../lib/wordpress-gateway";
import {
  RequestSecurityError,
  requireTrustedBrowserRequest,
} from "../../../../../lib/request-security";
import {
  enforceRequestLimit,
  RateLimitError,
} from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ reference: string }> },
) {
  try {
    requireTrustedBrowserRequest(request);
    const cookieStore = await cookies();
    const cartId = cookieStore.get(CART_COOKIE)?.value;
    if (!isValidCartId(cartId)) {
      return paymentError("The order was not found.", 404);
    }
    await enforceRequestLimit({
      scope: "order-action",
      subject: cartId,
      limit: 20,
      windowSeconds: 60,
    });

    const { reference } = await context.params;
    const order = await getAuthoritativeOrder(reference, cartId);
    const payment = await confirmPayment(order);
    if (["processing", "completed"].includes(payment.order.status)) {
      await clearCart(cartId);
    }

    return NextResponse.json(
      {
        order: publicOrder(payment.order),
        paymentMode: payment.mode,
      },
      {
        headers: { "cache-control": "private, no-store" },
      },
    );
  } catch (error) {
    if (
      error instanceof GatewayError ||
      error instanceof PaymentError ||
      error instanceof RequestSecurityError ||
      error instanceof RateLimitError
    ) {
      return paymentError(
        error.message,
        error.status,
        error instanceof RateLimitError ? error.retryAfter : undefined,
      );
    }
    return paymentError("The test payment could not be completed.", 503);
  }
}

function paymentError(
  message: string,
  status: number,
  retryAfter?: number,
): NextResponse {
  const headers: Record<string, string> = {
    "cache-control": "private, no-store",
  };
  if (retryAfter) {
    headers["retry-after"] = String(retryAfter);
  }
  return NextResponse.json(
    { error: message },
    {
      status,
      headers,
    },
  );
}
