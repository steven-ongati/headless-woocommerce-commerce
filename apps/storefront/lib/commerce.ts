import { randomUUID } from "node:crypto";

export type CommerceProduct = {
  databaseId: number;
  sku: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  price: string;
  regularPrice: string;
  currency: string;
  stockStatus: "instock" | "outofstock" | "onbackorder";
  categories: string[];
  featured: boolean;
};

export type CommerceStory = {
  databaseId: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  modified: string;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

export class CommerceDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceDataError";
  }
}

export async function getCatalog(): Promise<CommerceProduct[]> {
  const data = await queryCommerce<{ commerceCatalog: CommerceProduct[] }>(
    `query StorefrontCatalog {
      commerceCatalog(limit: 12) {
        databaseId
        sku
        name
        slug
        description
        shortDescription
        price
        regularPrice
        currency
        stockStatus
        categories
        featured
      }
    }`,
  );

  return data.commerceCatalog;
}

export async function getStory(
  slug: string,
  previewToken = "",
): Promise<CommerceStory | null> {
  const data = await queryCommerce<{
    commerceStoryPreview: CommerceStory | null;
  }>(
    `query StorefrontFieldNote($slug: String!, $previewToken: String) {
      commerceStoryPreview(slug: $slug, previewToken: $previewToken) {
        databaseId
        slug
        title
        excerpt
        content
        date
        modified
      }
    }`,
    { slug, previewToken },
  );

  return data.commerceStoryPreview;
}

export function formatPrice(price: string, currency: string): string {
  const value = Number(price);

  if (!Number.isFinite(value)) {
    throw new CommerceDataError(`Invalid price projection: ${price}`);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value);
}

async function queryCommerce<T>(
  query: string,
  variables: Record<string, string> = {},
): Promise<T> {
  const endpoint = process.env.WORDPRESS_GRAPHQL_URL;
  if (!endpoint) {
    throw new CommerceDataError("WORDPRESS_GRAPHQL_URL is not configured.");
  }

  const requestId = randomUUID();
  const startedAt = performance.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new CommerceDataError(
        `WordPress GraphQL returned HTTP ${response.status}.`,
      );
    }

    const body = (await response.json()) as GraphQLResponse<T>;
    if (body.errors?.length) {
      throw new CommerceDataError(
        body.errors.map((error) => error.message).join("; "),
      );
    }

    if (!body.data) {
      throw new CommerceDataError("WordPress GraphQL returned no data.");
    }

    logCommerceRequest("ok", requestId, startedAt);
    return body.data;
  } catch (error) {
    logCommerceRequest("error", requestId, startedAt);

    if (error instanceof CommerceDataError) {
      throw error;
    }

    throw new CommerceDataError("WordPress GraphQL is unavailable.");
  }
}

function logCommerceRequest(
  outcome: "ok" | "error",
  requestId: string,
  startedAt: number,
): void {
  console.info(
    JSON.stringify({
      event: "wordpress_graphql_request",
      outcome,
      requestId,
      durationMs: Math.round(performance.now() - startedAt),
    }),
  );
}
