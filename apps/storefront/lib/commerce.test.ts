import { describe, expect, it } from "vitest";

import { CommerceDataError, formatPrice } from "./commerce";

describe("formatPrice", () => {
  it("formats an authoritative decimal projection", () => {
    expect(formatPrice("148.00", "USD")).toBe("$148.00");
  });

  it("rejects a malformed price projection", () => {
    expect(() => formatPrice("not-a-price", "USD")).toThrow(CommerceDataError);
  });
});
