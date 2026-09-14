import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  addCartItem,
  CartError,
  getCartView,
  removeCartItem,
  setCartItemQuantity,
} from "../../../lib/cart";
import { CART_COOKIE, isValidCartId } from "../../../lib/cart-session";
import {
  RequestSecurityError,
  requireTrustedBrowserRequest,
} from "../../../lib/request-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleCartRequest(request, async (cartId) => getCartView(cartId));
}

export async function POST(request: NextRequest) {
  return handleCartRequest(request, async (cartId) => {
    const body = await readCartBody(request);
    return addCartItem(cartId, body.sku);
  });
}

export async function PATCH(request: NextRequest) {
  return handleCartRequest(request, async (cartId) => {
    const body = await readCartBody(request, true);
    return setCartItemQuantity(cartId, body.sku, body.quantity);
  });
}

export async function DELETE(request: NextRequest) {
  return handleCartRequest(request, async (cartId) => {
    const sku = request.nextUrl.searchParams.get("sku") ?? "";
    return removeCartItem(cartId, sku);
  });
}

async function handleCartRequest(
  request: NextRequest,
  operation: (cartId: string) => Promise<unknown>,
): Promise<NextResponse> {
  try {
    requireTrustedBrowserRequest(request);
    const cookieStore = await cookies();
    const existingCartId = cookieStore.get(CART_COOKIE)?.value;
    const cartId = isValidCartId(existingCartId) ? existingCartId : randomUUID();
    const response = NextResponse.json(await operation(cartId), {
      headers: { "cache-control": "private, no-store" },
    });

    if (cartId !== existingCartId) {
      response.cookies.set(CART_COOKIE, cartId, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
      });
    }
    return response;
  } catch (error) {
    const status =
      error instanceof CartError || error instanceof RequestSecurityError
        ? error.status
        : 503;
    const message =
      error instanceof CartError || error instanceof RequestSecurityError
        ? error.message
        : "The cart service is temporarily unavailable.";
    return NextResponse.json(
      { error: message },
      {
        status,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
}

async function readCartBody(
  request: NextRequest,
  quantityRequired = false,
): Promise<{ sku: string; quantity: number }> {
  let body: unknown;
  try {
    body = (await request.json()) as unknown;
  } catch {
    throw new CartError("The cart request body must be valid JSON.", 400);
  }
  if (!body || typeof body !== "object") {
    throw new CartError("A cart request body is required.", 400);
  }

  const input = body as { sku?: unknown; quantity?: unknown };
  if (typeof input.sku !== "string") {
    throw new CartError("A product identifier is required.", 400);
  }
  if (quantityRequired && typeof input.quantity !== "number") {
    throw new CartError("A numeric quantity is required.", 400);
  }

  return {
    sku: input.sku,
    quantity: typeof input.quantity === "number" ? input.quantity : 1,
  };
}
