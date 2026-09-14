import { NextRequest, NextResponse } from "next/server";

import { isOperationsRequestAuthorized } from "../../../../lib/operations-auth";
import {
  getProjectionStatus,
  rebuildCatalogProjection,
} from "../../../../lib/projection";
import { withRequestTrace } from "../../../../lib/request-trace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withRequestTrace(request, async () => {
    if (!isOperationsRequestAuthorized(request)) {
      return unauthorized();
    }

    return NextResponse.json(await getProjectionStatus(), {
      headers: { "cache-control": "private, no-store" },
    });
  });
}

export async function POST(request: NextRequest) {
  return withRequestTrace(request, async () => {
    if (!isOperationsRequestAuthorized(request)) {
      return unauthorized();
    }

    try {
      return NextResponse.json(await rebuildCatalogProjection(), {
        headers: { "cache-control": "private, no-store" },
      });
    } catch {
      return NextResponse.json(
        { error: "The catalog projection could not be rebuilt." },
        {
          status: 503,
          headers: { "cache-control": "private, no-store" },
        },
      );
    }
  });
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized" },
    {
      status: 401,
      headers: { "cache-control": "private, no-store" },
    },
  );
}
