import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { CART_COOKIE, isValidCartId } from "../../../../lib/cart-session";
import { publicOrder } from "../../../../lib/payment";
import {
  GatewayError,
  getAuthoritativeOrder,
} from "../../../../lib/wordpress-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ reference: string }> },
) {
  try {
    const cookieStore = await cookies();
    const cartId = cookieStore.get(CART_COOKIE)?.value;
    if (!isValidCartId(cartId)) {
      return orderError("The order was not found.", 404);
    }

    const { reference } = await context.params;
    const order = await getAuthoritativeOrder(reference, cartId);

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
    if (error instanceof GatewayError) {
      return orderError(error.message, error.status);
    }
    return orderError("The order service is temporarily unavailable.", 503);
  }
}

function orderError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "cache-control": "private, no-store" },
    },
  );
}
