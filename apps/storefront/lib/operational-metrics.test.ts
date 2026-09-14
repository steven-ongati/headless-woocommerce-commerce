import { describe, expect, it } from "vitest";

import { projectionLagSeconds } from "./operational-metrics";

describe("operational metrics", () => {
  it("calculates projection lag from the recorded index time", () => {
    expect(
      projectionLagSeconds(
        {
          status: "fresh",
          authoritativeCount: 4,
          projectedCount: 4,
          indexedAt: "2026-09-14T14:00:00.000Z",
          sourceFingerprint: "source",
          projectedFingerprint: "source",
        },
        Date.parse("2026-09-14T14:00:42.500Z"),
      ),
    ).toBe(42);
  });

  it("returns null before a projection has been built", () => {
    expect(
      projectionLagSeconds({
        status: "unbuilt",
        authoritativeCount: 4,
        projectedCount: null,
        indexedAt: null,
        sourceFingerprint: "source",
        projectedFingerprint: null,
      }),
    ).toBeNull();
  });
});
