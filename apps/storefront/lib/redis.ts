import { createClient } from "redis";

type CommerceRedisClient = ReturnType<typeof createClient>;

let clientPromise: Promise<CommerceRedisClient> | null = null;

export async function withRedis<T>(
  operation: (client: CommerceRedisClient) => Promise<T>,
): Promise<T> {
  const client = await getRedisClient();
  return operation(client);
}

async function getRedisClient(): Promise<CommerceRedisClient> {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not configured.");
  }

  if (!clientPromise) {
    const client = createClient({ url });
    client.on("error", (error: Error) => {
      console.error(
        JSON.stringify({
          event: "redis_connection_error",
          message: error.message,
        }),
      );
    });
    clientPromise = client.connect().then(() => client);
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }

  return clientPromise;
}
