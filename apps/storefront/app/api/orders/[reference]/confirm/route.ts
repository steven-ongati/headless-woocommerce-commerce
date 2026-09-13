import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ reference: string }> },
) {
  try {
    const cookieStore = await cookies();
    const cartId = cookieStore.get(CART_COOKIE)?.value;
    if (!isValidCartId(cartId)) {
      return paymentError("The order was not found.", 404);
    }

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
    if (error instanceof GatewayError || error instanceof PaymentError) {
      return paymentError(error.message, error.status);
    }
    return paymentError("The test payment could not be completed.", 503);
  }
}

function paymentError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "cache-control": "private, no-store" },
    },
  );
}
