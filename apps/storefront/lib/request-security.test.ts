import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import {
  RequestSecurityError,
  requireTrustedBrowserRequest,
} from "./request-security";

function request(headers: HeadersInit = {}, method = "POST") {
  return new NextRequest("https://commerce.test/api/cart", {
    method,
    headers,
  });
}

describe("requireTrustedBrowserRequest", () => {
  it("accepts same-origin browser mutations", () => {
    expect(() =>
      requireTrustedBrowserRequest(
        request({
          origin: "https://commerce.test",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects cross-origin browser mutations", () => {
    expect(() =>
      requireTrustedBrowserRequest(
        request({
          origin: "https://attacker.test",
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toThrow(RequestSecurityError);
  });

  it("allows safe reads regardless of browser provenance", () => {
    expect(() =>
      requireTrustedBrowserRequest(
        request(
          {
            origin: "https://attacker.test",
            "sec-fetch-site": "cross-site",
          },
          "GET",
        ),
      ),
    ).not.toThrow();
  });
});
