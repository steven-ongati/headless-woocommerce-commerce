import { createHash } from "node:crypto";

import { withRedis } from "./redis";

export class RateLimitError extends Error {
  readonly retryAfter: number;
  readonly status = 429;

  constructor(retryAfter: number) {
    super("Too many requests. Try again shortly.");
    this.name = "RateLimitError";
    this.retryAfter = Math.max(1, retryAfter);
  }
}

export async function enforceRequestLimit(input: {
  scope: string;
  subject: string;
  limit: number;
  windowSeconds: number;
}): Promise<void> {
  const subjectHash = createHash("sha256")
    .update(input.subject)
    .digest("hex");
  const key = `commerce:limit:${input.scope}:${subjectHash}`;

  await withRedis(async (client) => {
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, input.windowSeconds);
    }
    if (count <= input.limit) {
      return;
    }

    const ttl = await client.ttl(key);
    throw new RateLimitError(ttl > 0 ? ttl : input.windowSeconds);
  });
}
