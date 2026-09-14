import type { ProjectionStatus } from "./projection";
import { withRedis } from "./redis";

const METRICS_KEY = "commerce:metrics";

export type MetricName =
  | "callback.accepted"
  | "callback.duplicate"
  | "callback.rejected"
  | "cart.read.hit"
  | "cart.read.miss"
  | "cart.write"
  | "checkout.accepted"
  | "checkout.rejected"
  | "stock.conflict";

export type RedisOperationalMetrics = {
  activeCarts: number;
  counters: Record<string, number>;
};

export async function incrementMetric(name: MetricName): Promise<void> {
  await withRedis(async (client) => {
    await client.hIncrBy(METRICS_KEY, name, 1);
  });
}

export async function getRedisOperationalMetrics(): Promise<RedisOperationalMetrics> {
  return withRedis(async (client) => {
    const counters = await client.hGetAll(METRICS_KEY);
    let cursor = "0";
    let activeCarts = 0;

    do {
      const result = await client.scan(cursor, {
        MATCH: "commerce:cart:*",
        COUNT: 100,
      });
      cursor = result.cursor;
      activeCarts += result.keys.length;
    } while (cursor !== "0");

    return {
      activeCarts,
      counters: Object.fromEntries(
        Object.entries(counters).map(([name, value]) => [
          name,
          Number(value),
        ]),
      ),
    };
  });
}

export function projectionLagSeconds(
  projection: ProjectionStatus,
  now = Date.now(),
): number | null {
  if (!projection.indexedAt) {
    return null;
  }

  const indexedAt = Date.parse(projection.indexedAt);
  if (!Number.isFinite(indexedAt)) {
    return null;
  }

  return Math.max(0, Math.floor((now - indexedAt) / 1_000));
}
