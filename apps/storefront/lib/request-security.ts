import { NextRequest } from "next/server";

export class RequestSecurityError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "RequestSecurityError";
  }
}

export function requireTrustedBrowserRequest(request: NextRequest): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return;
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    throw new RequestSecurityError("The request origin is not allowed.");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw new RequestSecurityError("The request site is not allowed.");
  }
}
