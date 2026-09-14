import { draftMode } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  PREVIEW_EXPIRY_COOKIE,
  verifyPreviewToken,
} from "../../../lib/preview-token";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  const expires = request.nextUrl.searchParams.get("expires") ?? "";
  const signature = request.nextUrl.searchParams.get("signature") ?? "";

  if (
    !verifyPreviewToken({
      slug,
      expires,
      signature,
      secret: process.env.COMMERCE_PREVIEW_SECRET ?? "",
    })
  ) {
    return NextResponse.json(
      { error: "Invalid preview request." },
      {
        status: 401,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }

  const mode = await draftMode();
  mode.enable();

  const response = new NextResponse(null, {
    status: 307,
    headers: {
      "cache-control": "private, no-store",
      location: `/field-notes/${encodeURIComponent(slug)}`,
      referrer: "no-referrer",
    },
  });
  const expiry = Number(expires);
  response.cookies.set(PREVIEW_EXPIRY_COOKIE, expires, {
    httpOnly: true,
    maxAge: Math.max(0, expiry - Math.floor(Date.now() / 1_000)),
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
  });
  return response;
}
