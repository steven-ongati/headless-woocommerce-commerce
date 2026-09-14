import { currentRequestId } from "./request-trace";

export { formatPrice } from "./money";

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
  modified: string;
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
  const products: CommerceProduct[] = [];
  const pageSize = 50;

  for (let offset = 0; offset < 1_000; offset += pageSize) {
    const data = await queryCommerce<{
      commerceCatalog: CommerceProduct[];
    }>(
      `query StorefrontCatalog($limit: Int!, $offset: Int!) {
        commerceCatalog(limit: $limit, offset: $offset) {
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
          modified
        }
      }`,
      { limit: pageSize, offset },
    );
    products.push(...data.commerceCatalog);
    if (data.commerceCatalog.length < pageSize) {
      return products;
    }
  }

  throw new CommerceDataError("The catalog exceeded the bounded page limit.");
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

async function queryCommerce<T>(
  query: string,
  variables: Record<string, string | number> = {},
): Promise<T> {
  const endpoint = process.env.WORDPRESS_GRAPHQL_URL;
  if (!endpoint) {
    throw new CommerceDataError("WORDPRESS_GRAPHQL_URL is not configured.");
  }

  const requestId = currentRequestId();
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
