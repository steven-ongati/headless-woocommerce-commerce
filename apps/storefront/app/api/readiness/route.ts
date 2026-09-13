import { NextResponse } from "next/server";

import { getCatalog } from "../../../lib/commerce";
import { getProjectionStatus } from "../../../lib/projection";
import { withRedis } from "../../../lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const [catalog, redisStatus] = await Promise.all([
      getCatalog(),
      withRedis((client) => client.ping()),
    ]);
    const projection = await getProjectionStatus(catalog);

    return NextResponse.json(
      {
        service: "storefront",
        status: projection.status === "fresh" ? "ready" : "degraded",
        dependencies: {
          wordpress: "ready",
          redis: redisStatus === "PONG" ? "ready" : "unavailable",
          projection: projection.status,
        },
        catalogCount: catalog.length,
        timestamp: new Date().toISOString(),
      },
      {
        headers: { "cache-control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      {
        service: "storefront",
        status: "unavailable",
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
