import { timingSafeEqual } from "node:crypto";

import { draftMode } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.COMMERCE_PREVIEW_SECRET ?? "";
  const suppliedSecret = request.nextUrl.searchParams.get("secret") ?? "";
  const slug = request.nextUrl.searchParams.get("slug") ?? "";

  if (!isValidSecret(suppliedSecret, expectedSecret) || !isValidSlug(slug)) {
    return NextResponse.json(
      { error: "Invalid preview request." },
      { status: 401 },
    );
  }

  const mode = await draftMode();
  mode.enable();

  return new NextResponse(null, {
    status: 307,
    headers: {
      "cache-control": "private, no-store",
      location: `/field-notes/${encodeURIComponent(slug)}`,
      referrer: "no-referrer",
    },
  });
}

function isValidSecret(supplied: string, expected: string): boolean {
  if (supplied.length === 0 || supplied.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
