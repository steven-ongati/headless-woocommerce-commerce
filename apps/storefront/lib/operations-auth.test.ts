import { afterEach, describe, expect, it } from "vitest";

import { isOperationsRequestAuthorized } from "./operations-auth";

afterEach(() => {
  delete process.env.COMMERCE_OPERATIONS_SECRET;
});

describe("operations authorization", () => {
  it("accepts an exact configured secret", () => {
    process.env.COMMERCE_OPERATIONS_SECRET = "configured-operations-secret";
    const request = new Request("http://localhost/api/operations", {
      headers: {
        "x-operations-secret": "configured-operations-secret",
      },
    });

    expect(isOperationsRequestAuthorized(request)).toBe(true);
  });

  it("rejects missing and mismatched secrets", () => {
    process.env.COMMERCE_OPERATIONS_SECRET = "configured-operations-secret";

    expect(
      isOperationsRequestAuthorized(
        new Request("http://localhost/api/operations"),
      ),
    ).toBe(false);
    expect(
      isOperationsRequestAuthorized(
        new Request("http://localhost/api/operations", {
          headers: { "x-operations-secret": "different-secret-value" },
        }),
      ),
    ).toBe(false);
  });
});
