import { createHash } from "node:crypto";

import { CommerceProduct, getCatalog } from "./commerce";
import { withRedis } from "./redis";
import { currentRequestId } from "./request-trace";

const INDEX_UID = "catalog-products";
const METADATA_KEY = "commerce:projection:catalog";

export type CatalogSearchOptions = {
  query?: string;
  category?: string;
  availability?: "instock" | "outofstock";
  sort?: "featured" | "name" | "price-asc" | "price-desc";
};

export type CatalogSearchResult = {
  products: CommerceProduct[];
  categories: string[];
  source: "projection" | "authority";
  projectionStatus: ProjectionStatus["status"];
  indexedAt: string | null;
};

export type ProjectionStatus = {
  status: "fresh" | "drifted" | "unbuilt" | "unavailable";
  authoritativeCount: number | null;
  projectedCount: number | null;
  indexedAt: string | null;
  sourceFingerprint: string | null;
  projectedFingerprint: string | null;
};

type ProjectionMetadata = {
  fingerprint: string;
  indexedAt: string;
  productCount: number;
};

type MeiliTask = {
  taskUid: number;
  status?: "enqueued" | "processing" | "succeeded" | "failed" | "canceled";
  error?: { message: string };
};

type MeiliIndex = {
  uid: string;
};

type MeiliSearchResponse = {
  hits: CommerceProduct[];
};

type MeiliStats = {
  numberOfDocuments: number;
};

export function buildCatalogFingerprint(products: CommerceProduct[]): string {
  const stableProducts = [...products]
    .sort((left, right) => left.sku.localeCompare(right.sku))
    .map((product) => ({
      sku: product.sku,
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      price: product.price,
      regularPrice: product.regularPrice,
      currency: product.currency,
      stockStatus: product.stockStatus,
      categories: [...product.categories].sort(),
      featured: product.featured,
    }));

  return createHash("sha256")
    .update(JSON.stringify(stableProducts))
    .digest("hex");
}

export function filterCatalog(
  products: CommerceProduct[],
  options: CatalogSearchOptions,
): CommerceProduct[] {
  const query = normalizeQuery(options.query);
  const category = normalizeCategory(options.category);
  const availability = options.availability;
  const filtered = products.filter((product) => {
    const searchable = [
      product.name,
      product.sku,
      product.description,
      product.shortDescription,
      ...product.categories,
    ]
      .join(" ")
      .toLocaleLowerCase();

    return (
      (!query || searchable.includes(query)) &&
      (!category || product.categories.includes(category)) &&
      (!availability || product.stockStatus === availability)
    );
  });

  return sortProducts(filtered, options.sort);
}

export async function searchCatalog(
  options: CatalogSearchOptions,
): Promise<CatalogSearchResult> {
  const authority = await getCatalog();
  const categories = [
    ...new Set(authority.flatMap((product) => product.categories)),
  ].sort();
  const status = await getProjectionStatus(authority);

  if (status.status !== "fresh") {
    return {
      products: filterCatalog(authority, options),
      categories,
      source: "authority",
      projectionStatus: status.status,
      indexedAt: status.indexedAt,
    };
  }

  try {
    const response = await meiliRequest<MeiliSearchResponse>(
      `/indexes/${INDEX_UID}/search`,
      {
        method: "POST",
        body: JSON.stringify(buildSearchBody(options)),
      },
    );

    return {
      products: response.hits,
      categories,
      source: "projection",
      projectionStatus: status.status,
      indexedAt: status.indexedAt,
    };
  } catch {
    return {
      products: filterCatalog(authority, options),
      categories,
      source: "authority",
      projectionStatus: "unavailable",
      indexedAt: status.indexedAt,
    };
  }
}

export async function rebuildCatalogProjection(): Promise<ProjectionStatus> {
  const products = await getCatalog();
  await ensureIndex();
  await updateIndexSettings();
  await replaceDocuments(products);

  const metadata: ProjectionMetadata = {
    fingerprint: buildCatalogFingerprint(products),
    indexedAt: new Date().toISOString(),
    productCount: products.length,
  };
  await withRedis((client) =>
    client.set(METADATA_KEY, JSON.stringify(metadata)),
  );

  return {
    status: "fresh",
    authoritativeCount: products.length,
    projectedCount: products.length,
    indexedAt: metadata.indexedAt,
    sourceFingerprint: metadata.fingerprint,
    projectedFingerprint: metadata.fingerprint,
  };
}

export async function getProjectionStatus(
  knownAuthority?: CommerceProduct[],
): Promise<ProjectionStatus> {
  try {
    const products = knownAuthority ?? (await getCatalog());
    const sourceFingerprint = buildCatalogFingerprint(products);
    const [storedMetadata, stats] = await Promise.all([
      withRedis((client) => client.get(METADATA_KEY)),
      meiliRequest<Partial<MeiliStats>>(
        `/indexes/${INDEX_UID}/stats`,
        {},
        [404],
      ),
    ]);
    const projectedCount =
      typeof stats.numberOfDocuments === "number"
        ? stats.numberOfDocuments
        : null;

    if (!storedMetadata || projectedCount === null) {
      return {
        status: "unbuilt",
        authoritativeCount: products.length,
        projectedCount,
        indexedAt: null,
        sourceFingerprint,
        projectedFingerprint: null,
      };
    }

    const metadata = parseMetadata(storedMetadata);
    if (!metadata) {
      return {
        status: "unbuilt",
        authoritativeCount: products.length,
        projectedCount,
        indexedAt: null,
        sourceFingerprint,
        projectedFingerprint: null,
      };
    }

    const isFresh =
      metadata.fingerprint === sourceFingerprint &&
      metadata.productCount === projectedCount;

    return {
      status: isFresh ? "fresh" : "drifted",
      authoritativeCount: products.length,
      projectedCount,
      indexedAt: metadata.indexedAt,
      sourceFingerprint,
      projectedFingerprint: metadata.fingerprint,
    };
  } catch {
    return {
      status: "unavailable",
      authoritativeCount: null,
      projectedCount: null,
      indexedAt: null,
      sourceFingerprint: null,
      projectedFingerprint: null,
    };
  }
}

function buildSearchBody(options: CatalogSearchOptions): Record<string, unknown> {
  const filters: string[] = [];
  const category = normalizeCategory(options.category);
  if (category) {
    filters.push(`categories = "${escapeFilterValue(category)}"`);
  }
  if (options.availability) {
    filters.push(`stockStatus = "${options.availability}"`);
  }

  const sort =
    options.sort === "name"
      ? ["name:asc"]
      : options.sort === "price-asc"
        ? ["priceValue:asc"]
        : options.sort === "price-desc"
          ? ["priceValue:desc"]
          : ["featured:desc", "name:asc"];

  return {
    q: options.query?.trim().slice(0, 80) ?? "",
    filter: filters,
    sort,
    limit: 24,
  };
}

async function ensureIndex(): Promise<void> {
  const existing = await meiliRequest<MeiliIndex>(
    `/indexes/${INDEX_UID}`,
    {},
    [404],
  );
  if (existing.uid === INDEX_UID) {
    return;
  }

  const task = await meiliRequest<MeiliTask>("/indexes", {
    method: "POST",
    body: JSON.stringify({ uid: INDEX_UID, primaryKey: "sku" }),
  });
  await waitForTask(task.taskUid);
}

async function updateIndexSettings(): Promise<void> {
  const task = await meiliRequest<MeiliTask>(
    `/indexes/${INDEX_UID}/settings`,
    {
      method: "PATCH",
      body: JSON.stringify({
        displayedAttributes: ["*"],
        filterableAttributes: [
          "categories",
          "stockStatus",
          "featured",
          "currency",
        ],
        searchableAttributes: [
          "name",
          "sku",
          "shortDescription",
          "description",
          "categories",
        ],
        sortableAttributes: ["name", "priceValue", "featured"],
      }),
    },
  );
  await waitForTask(task.taskUid);
}

async function replaceDocuments(products: CommerceProduct[]): Promise<void> {
  const deleteTask = await meiliRequest<MeiliTask>(
    `/indexes/${INDEX_UID}/documents`,
    { method: "DELETE" },
  );
  await waitForTask(deleteTask.taskUid);

  if (products.length === 0) {
    return;
  }

  const documents = products.map((product) => ({
    ...product,
    priceValue: Number(product.price),
  }));
  const task = await meiliRequest<MeiliTask>(
    `/indexes/${INDEX_UID}/documents`,
    {
      method: "PUT",
      body: JSON.stringify(documents),
    },
  );
  await waitForTask(task.taskUid);
}

async function waitForTask(taskUid: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const task = await meiliRequest<MeiliTask>(`/tasks/${taskUid}`);
    if (task.status === "succeeded") {
      return;
    }
    if (task.status === "failed" || task.status === "canceled") {
      throw new Error(task.error?.message ?? `Meilisearch task ${taskUid} failed.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Meilisearch task ${taskUid} timed out.`);
}

async function meiliRequest<T>(
  path: string,
  init: RequestInit = {},
  acceptedErrorStatuses: number[] = [],
): Promise<T> {
  const endpoint = process.env.MEILISEARCH_URL;
  const apiKey = process.env.MEILISEARCH_MASTER_KEY;
  if (!endpoint || !apiKey) {
    throw new Error("Meilisearch is not configured.");
  }

  const requestId = currentRequestId();
  const startedAt = performance.now();
  const response = await fetch(`${endpoint}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-request-id": requestId,
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });

  console.info(
    JSON.stringify({
      event: "catalog_projection_request",
      outcome:
        response.ok || acceptedErrorStatuses.includes(response.status)
          ? "ok"
          : "error",
      requestId,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    }),
  );

  if (!response.ok && !acceptedErrorStatuses.includes(response.status)) {
    throw new Error(`Meilisearch returned HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

function normalizeQuery(query?: string): string {
  return query?.trim().slice(0, 80).toLocaleLowerCase() ?? "";
}

function normalizeCategory(category?: string): string {
  const normalized = category?.trim().slice(0, 60) ?? "";
  return /^[\p{L}\p{N} &'/-]+$/u.test(normalized) ? normalized : "";
}

function escapeFilterValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function sortProducts(
  products: CommerceProduct[],
  sort: CatalogSearchOptions["sort"],
): CommerceProduct[] {
  return [...products].sort((left, right) => {
    if (sort === "name") {
      return left.name.localeCompare(right.name);
    }
    if (sort === "price-asc") {
      return Number(left.price) - Number(right.price);
    }
    if (sort === "price-desc") {
      return Number(right.price) - Number(left.price);
    }
    return Number(right.featured) - Number(left.featured);
  });
}

function parseMetadata(value: string): ProjectionMetadata | null {
  try {
    const parsed = JSON.parse(value) as Partial<ProjectionMetadata>;
    if (
      typeof parsed.fingerprint === "string" &&
      typeof parsed.indexedAt === "string" &&
      typeof parsed.productCount === "number"
    ) {
      return {
        fingerprint: parsed.fingerprint,
        indexedAt: parsed.indexedAt,
        productCount: parsed.productCount,
      };
    }
  } catch {
    return null;
  }

  return null;
}
