import { timingSafeEqual } from "node:crypto";

export function isOperationsRequestAuthorized(request: Request): boolean {
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
