import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  getProjectionStatus,
  rebuildCatalogProjection,
} from "../../../../lib/projection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  return NextResponse.json(await getProjectionStatus(), {
    headers: { "cache-control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
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
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.COMMERCE_OPERATIONS_SECRET ?? "";
  const supplied = request.headers.get("x-operations-secret") ?? "";
  if (
    expected.length < 16 ||
    supplied.length === 0 ||
    supplied.length !== expected.length
  ) {
    return false;
  }

  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
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
