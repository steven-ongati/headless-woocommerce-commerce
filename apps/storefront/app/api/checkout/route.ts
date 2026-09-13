import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { CartError, getCheckoutLines } from "../../../lib/cart";
import { CART_COOKIE, isValidCartId } from "../../../lib/cart-session";
import {
  PaymentError,
  preparePayment,
  publicOrder,
} from "../../../lib/payment";
import {
  createAuthoritativeOrder,
  GatewayError,
} from "../../../lib/wordpress-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const input = await checkoutInput(request);
    const cookieStore = await cookies();
    const cartId = cookieStore.get(CART_COOKIE)?.value;
    if (!isValidCartId(cartId)) {
      throw new CartError("Add a product before checkout.", 400);
    }

    const lines = await getCheckoutLines(cartId);
    const order = await createAuthoritativeOrder({
      idempotencyKey: input.idempotencyKey,
      cartId,
      email: input.email,
      lines,
    });
    const payment = await preparePayment(
      order,
      cartId,
      input.idempotencyKey,
    );

    return NextResponse.json(
      {
        order: publicOrder(payment.order),
        paymentMode: payment.mode,
      },
      {
        status: 201,
        headers: { "cache-control": "private, no-store" },
      },
    );
  } catch (error) {
    return checkoutError(error);
  }
}

async function checkoutInput(request: NextRequest): Promise<{
  email: string;
  idempotencyKey: string;
}> {
  let body: unknown;
  try {
    body = (await request.json()) as unknown;
  } catch {
    throw new CartError("The checkout body must be valid JSON.", 400);
  }
  if (!body || typeof body !== "object") {
    throw new CartError("The checkout body is required.", 400);
  }

  const input = body as { email?: unknown; idempotencyKey?: unknown };
  if (
    typeof input.email !== "string" ||
    typeof input.idempotencyKey !== "string"
  ) {
    throw new CartError(
      "A synthetic email and idempotency key are required.",
      400,
    );
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.idempotencyKey,
    )
  ) {
    throw new CartError("The idempotency key is invalid.", 400);
  }

  return {
    email: input.email.trim().toLowerCase(),
    idempotencyKey: input.idempotencyKey.toLowerCase(),
  };
}

function checkoutError(error: unknown): NextResponse {
  const known =
    error instanceof CartError ||
    error instanceof GatewayError ||
    error instanceof PaymentError;
  return NextResponse.json(
    {
      error: known
        ? error.message
        : "Checkout is temporarily unavailable.",
    },
    {
      status: known ? error.status : 503,
      headers: { "cache-control": "private, no-store" },
    },
  );
}
