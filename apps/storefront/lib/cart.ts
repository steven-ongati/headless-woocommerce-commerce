import { CommerceProduct, getCatalog } from "./commerce";
import {
  CartView,
  StoredCart,
  StoredCartLine,
} from "./cart-contract";
import { withRedis } from "./redis";

const CART_TTL_SECONDS = 60 * 60 * 24 * 7;

export class CartError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CartError";
  }
}

export async function getCartView(cartId: string): Promise<CartView> {
  const cart = await readCart(cartId);
  if (cart.lines.length === 0) {
    return emptyCartView(cart);
  }

  return revalidateCart(cart, await getCatalog());
}

export function revalidateCart(
  cart: StoredCart,
  catalog: CommerceProduct[],
): CartView {
  const products = new Map(catalog.map((product) => [product.sku, product]));
  const lines = cart.lines.map((line) => {
    const product = products.get(line.sku);
    const currentPrice =
      product && Number.isFinite(Number(product.price)) ? product.price : null;
    const available =
      product?.stockStatus === "instock" && currentPrice !== null;
    return {
      ...line,
      currentPrice,
      priceChanged:
        currentPrice !== null ? currentPrice !== line.capturedPrice : false,
      available,
    };
  });
  const currency = lines[0]?.currency ?? "USD";
  const subtotal = lines.reduce((total, line) => {
    if (!line.available || line.currentPrice === null) {
      return total;
    }
    return total + Number(line.currentPrice) * line.quantity;
  }, 0);

  return {
    id: cart.id,
    lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotal: subtotal.toFixed(2),
    currency,
    updatedAt: cart.updatedAt,
  };
}

export async function addCartItem(
  cartId: string,
  sku: string,
): Promise<CartView> {
  const cart = await readCart(cartId);
  const existing = cart.lines.find((line) => line.sku === sku);
  const quantity = (existing?.quantity ?? 0) + 1;
  return setCartItemQuantity(cartId, sku, quantity);
}

export async function setCartItemQuantity(
  cartId: string,
  sku: string,
  quantity: number,
): Promise<CartView> {
  validateSku(sku);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) {
    throw new CartError("Quantity must be an integer from 0 to 20.", 400);
  }

  const cart = await readCart(cartId);
  if (quantity === 0) {
    cart.lines = cart.lines.filter((line) => line.sku !== sku);
    await writeCart(cart);
    return getCartView(cartId);
  }

  const product = await findAuthoritativeProduct(sku);
  if (product.stockStatus !== "instock") {
    throw new CartError("This product is not currently available.", 409);
  }

  const line: StoredCartLine = {
    sku: product.sku,
    quantity,
    name: product.name,
    capturedPrice: product.price,
    currency: product.currency,
    capturedAt: new Date().toISOString(),
  };
  const existingIndex = cart.lines.findIndex((item) => item.sku === sku);
  if (existingIndex >= 0) {
    cart.lines[existingIndex] = line;
  } else {
    cart.lines.push(line);
  }

  await writeCart(cart);
  return getCartView(cartId);
}

export async function removeCartItem(
  cartId: string,
  sku: string,
): Promise<CartView> {
  validateSku(sku);
  const cart = await readCart(cartId);
  cart.lines = cart.lines.filter((line) => line.sku !== sku);
  await writeCart(cart);
  return getCartView(cartId);
}

export async function getCheckoutLines(
  cartId: string,
): Promise<Array<{ sku: string; quantity: number }>> {
  const cart = await readCart(cartId);
  if (cart.lines.length === 0) {
    throw new CartError("Add at least one product before checkout.", 400);
  }

  const view = revalidateCart(cart, await getCatalog());
  if (view.lines.some((line) => !line.available)) {
    throw new CartError(
      "Remove unavailable products before checkout.",
      409,
    );
  }

  return view.lines.map((line) => ({
    sku: line.sku,
    quantity: line.quantity,
  }));
}

export async function clearCart(cartId: string): Promise<void> {
  await withRedis((client) => client.del(cartKey(cartId)));
}

async function readCart(cartId: string): Promise<StoredCart> {
  const stored = await withRedis((client) =>
    client.get(cartKey(cartId)),
  );
  if (!stored) {
    return {
      id: cartId,
      lines: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const parsed = parseStoredCart(stored);
  if (!parsed || parsed.id !== cartId) {
    throw new CartError("The stored cart could not be read.", 500);
  }
  return parsed;
}

async function writeCart(cart: StoredCart): Promise<void> {
  cart.updatedAt = new Date().toISOString();
  await withRedis((client) =>
    client.set(cartKey(cart.id), JSON.stringify(cart), {
      EX: CART_TTL_SECONDS,
    }),
  );
}

async function findAuthoritativeProduct(sku: string): Promise<CommerceProduct> {
  const product = (await getCatalog()).find((item) => item.sku === sku);
  if (!product) {
    throw new CartError("The product no longer exists.", 404);
  }
  return product;
}

function validateSku(sku: string): void {
  if (!/^[A-Z0-9-]{3,40}$/.test(sku)) {
    throw new CartError("The product identifier is invalid.", 400);
  }
}

function emptyCartView(cart: StoredCart): CartView {
  return {
    id: cart.id,
    lines: [],
    itemCount: 0,
    subtotal: "0.00",
    currency: "USD",
    updatedAt: cart.updatedAt,
  };
}

function cartKey(cartId: string): string {
  return `commerce:cart:${cartId}`;
}

function parseStoredCart(value: string): StoredCart | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredCart>;
    if (
      typeof parsed.id === "string" &&
      typeof parsed.updatedAt === "string" &&
      Array.isArray(parsed.lines) &&
      parsed.lines.every(isStoredCartLine)
    ) {
      return {
        id: parsed.id,
        lines: parsed.lines,
        updatedAt: parsed.updatedAt,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function isStoredCartLine(value: unknown): value is StoredCartLine {
  if (!value || typeof value !== "object") {
    return false;
  }
  const line = value as Partial<StoredCartLine>;
  return (
    typeof line.sku === "string" &&
    typeof line.quantity === "number" &&
    typeof line.name === "string" &&
    typeof line.capturedPrice === "string" &&
    typeof line.currency === "string" &&
    typeof line.capturedAt === "string"
  );
}
