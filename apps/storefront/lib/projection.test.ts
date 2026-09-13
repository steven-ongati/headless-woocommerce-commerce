import { describe, expect, it } from "vitest";

import type { CommerceProduct } from "./commerce";
import { buildCatalogFingerprint, filterCatalog } from "./projection";

const products: CommerceProduct[] = [
  product({
    sku: "NS-PACK-001",
    name: "Ridgeline Pack",
    price: "148.00",
    categories: ["Carry"],
    featured: true,
  }),
  product({
    sku: "NS-LIGHT-002",
    name: "Waypoint Lantern",
    price: "64.00",
    categories: ["Camp"],
    stockStatus: "outofstock",
  }),
  product({
    sku: "NS-MUG-003",
    name: "Switchback Mug",
    price: "28.00",
    categories: ["Camp"],
  }),
];

describe("catalog projection", () => {
  it("builds the same fingerprint regardless of source ordering", () => {
    expect(buildCatalogFingerprint(products)).toBe(
      buildCatalogFingerprint([...products].reverse()),
    );
  });

  it("changes the fingerprint when authoritative commerce data changes", () => {
    const changed = products.map((item) =>
      item.sku === "NS-PACK-001" ? { ...item, price: "152.00" } : item,
    );

    expect(buildCatalogFingerprint(changed)).not.toBe(
      buildCatalogFingerprint(products),
    );
  });

  it("applies text, category, availability, and price sorting", () => {
    expect(
      filterCatalog(products, {
        query: "camp",
        category: "Camp",
        availability: "instock",
        sort: "price-desc",
      }).map((item) => item.sku),
    ).toEqual(["NS-MUG-003"]);

    expect(
      filterCatalog(products, { category: "Camp", sort: "price-desc" }).map(
        (item) => item.sku,
      ),
    ).toEqual(["NS-LIGHT-002", "NS-MUG-003"]);
  });
});

function product(
  overrides: Partial<CommerceProduct> & Pick<CommerceProduct, "sku" | "name">,
): CommerceProduct {
  return {
    databaseId: 1,
    slug: overrides.sku.toLocaleLowerCase(),
    description: "Synthetic field equipment.",
    shortDescription: "Synthetic equipment.",
    price: "10.00",
    regularPrice: "10.00",
    currency: "USD",
    stockStatus: "instock",
    categories: [],
    featured: false,
    modified: "2026-09-13T00:00:00+00:00",
    ...overrides,
  };
}
