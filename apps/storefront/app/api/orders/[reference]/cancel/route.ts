import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { CART_COOKIE, isValidCartId } from "../../../../../lib/cart-session";
import { publicOrder } from "../../../../../lib/payment";
import {
  cancelAuthoritativeOrder,
  GatewayError,
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
      return cancelError("The order was not found.", 404);
    }
    await enforceRequestLimit({
      scope: "order-action",
      subject: cartId,
      limit: 20,
      windowSeconds: 60,
    });

    const { reference } = await context.params;
    const order = await cancelAuthoritativeOrder(reference, cartId);

    return NextResponse.json(
      {
        order: publicOrder(order),
        paymentMode:
          process.env.PAYMENT_MODE === "stripe-test"
            ? "stripe-test"
            : "simulator",
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    if (
      error instanceof GatewayError ||
      error instanceof RequestSecurityError ||
      error instanceof RateLimitError
    ) {
      return cancelError(
        error.message,
        error.status,
        error instanceof RateLimitError ? error.retryAfter : undefined,
      );
    }
    return cancelError("The pending order could not be cancelled.", 503);
  }
}

function cancelError(
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
