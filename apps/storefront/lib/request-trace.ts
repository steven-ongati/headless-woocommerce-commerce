import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

const traceStorage = new AsyncLocalStorage<string>();

export function currentRequestId(): string {
  return traceStorage.getStore() ?? randomUUID();
}

export async function withRequestTrace(
  request: Request,
  operation: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const requestId = acceptedRequestId(request) ?? randomUUID();

  return traceStorage.run(requestId, async () => {
    const response = await operation();
    response.headers.set("x-request-id", requestId);
    return response;
  });
}

function acceptedRequestId(request: Request): string | null {
  const supplied = request.headers.get("x-request-id")?.trim() ?? "";
  return /^[A-Za-z0-9_-]{8,64}$/.test(supplied) ? supplied : null;
}
