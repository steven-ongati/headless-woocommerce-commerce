import { NextRequest, NextResponse } from "next/server";

import {
  getRedisOperationalMetrics,
  projectionLagSeconds,
} from "../../../../lib/operational-metrics";
import { isOperationsRequestAuthorized } from "../../../../lib/operations-auth";
import { getProjectionStatus } from "../../../../lib/projection";
import { withRequestTrace } from "../../../../lib/request-trace";
import { getAuthorityOperationalMetrics } from "../../../../lib/wordpress-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withRequestTrace(request, async () => {
    if (!isOperationsRequestAuthorized(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: { "cache-control": "private, no-store" },
        },
      );
    }

    try {
      const [authority, projection, redis] = await Promise.all([
        getAuthorityOperationalMetrics(),
        getProjectionStatus(),
        getRedisOperationalMetrics(),
      ]);

      return NextResponse.json(
        {
          observedAt: new Date().toISOString(),
          authority,
          projection: {
            ...projection,
            lagSeconds: projectionLagSeconds(projection),
          },
          redis,
        },
        { headers: { "cache-control": "private, no-store" } },
      );
    } catch {
      return NextResponse.json(
        { error: "Operational metrics are temporarily unavailable." },
        {
          status: 503,
          headers: { "cache-control": "private, no-store" },
        },
      );
    }
  });
}
