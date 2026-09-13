import { describe, expect, it } from "vitest";

import type { StoredCart } from "./cart-contract";
import { revalidateCart } from "./cart";
import type { CommerceProduct } from "./commerce";

const cart: StoredCart = {
  id: "cart-id",
  updatedAt: "2026-09-13T00:00:00.000Z",
  lines: [
    {
      sku: "NS-PACK-001",
      quantity: 2,
      name: "Ridgeline Pack",
      capturedPrice: "148.00",
      currency: "USD",
      capturedAt: "2026-09-13T00:00:00.000Z",
    },
    {
      sku: "NS-LIGHT-002",
      quantity: 1,
      name: "Waypoint Lantern",
      capturedPrice: "64.00",
      currency: "USD",
      capturedAt: "2026-09-13T00:00:00.000Z",
    },
  ],
};

describe("cart revalidation", () => {
  it("uses current authoritative prices and reports drift", () => {
    const view = revalidateCart(cart, [
      product("NS-PACK-001", "152.00", "instock"),
      product("NS-LIGHT-002", "64.00", "outofstock"),
    ]);

    expect(view.subtotal).toBe("304.00");
    expect(view.lines[0]).toMatchObject({
      currentPrice: "152.00",
      priceChanged: true,
      available: true,
    });
    expect(view.lines[1]).toMatchObject({
      priceChanged: false,
      available: false,
    });
  });

  it("marks removed authoritative products unavailable", () => {
    const view = revalidateCart(cart, []);

    expect(view.subtotal).toBe("0.00");
    expect(view.lines.every((line) => !line.available)).toBe(true);
  });
});

function product(
  sku: string,
  price: string,
  stockStatus: CommerceProduct["stockStatus"],
): CommerceProduct {
  return {
    databaseId: 1,
    sku,
    name: sku,
    slug: sku.toLocaleLowerCase(),
    description: "Synthetic field equipment.",
    shortDescription: "Synthetic equipment.",
    price,
    regularPrice: price,
    currency: "USD",
    stockStatus,
    categories: ["Field gear"],
    featured: false,
    modified: "2026-09-13T00:00:00+00:00",
  };
}
