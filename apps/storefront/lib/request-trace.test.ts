import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";

import {
  currentRequestId,
  withRequestTrace,
} from "./request-trace";

describe("request tracing", () => {
  it("propagates an accepted request identifier", async () => {
    const response = await withRequestTrace(
      new Request("http://localhost/api/test", {
        headers: { "x-request-id": "trace_test_1234" },
      }),
      async () =>
        NextResponse.json({ requestId: currentRequestId() }),
    );

    await expect(response.json()).resolves.toEqual({
      requestId: "trace_test_1234",
    });
    expect(response.headers.get("x-request-id")).toBe("trace_test_1234");
  });

  it("replaces malformed request identifiers", async () => {
    const response = await withRequestTrace(
      new Request("http://localhost/api/test", {
        headers: { "x-request-id": "spaces are rejected" },
      }),
      async () =>
        NextResponse.json({ requestId: currentRequestId() }),
    );
    const body = (await response.json()) as { requestId: string };

    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
  });
});
