import { CommerceProduct } from "../lib/commerce";
import type { ProjectionStatus } from "../lib/projection";
import { ProductCard } from "./ProductCard";

type CatalogProps =
  | {
      status: "ready";
      products: CommerceProduct[];
      categories: string[];
      source: "projection" | "authority";
      projectionStatus: ProjectionStatus["status"];
      indexedAt: string | null;
    }
  | { status: "unavailable" };

export function Catalog(props: CatalogProps) {
  if (props.status === "unavailable") {
    return (
      <div className="catalog-unavailable" role="status">
        <p className="eyebrow">Catalog connection</p>
        <h3>The field kit is temporarily out of reach.</h3>
        <p>
          The storefront could not read the authoritative WooCommerce catalog.
          Check the WordPress health endpoint and retry.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="projection-status" role="status">
        <span>
          {props.source === "projection"
            ? "Search projection"
            : "Authoritative fallback"}
        </span>
        <p>
          {props.projectionStatus === "fresh"
            ? `Projection current${props.indexedAt ? ` · rebuilt ${new Date(props.indexedAt).toLocaleString("en-US")}` : ""}.`
            : "Projection is stale or unavailable; results are read directly from WooCommerce."}
        </p>
      </div>
      {props.products.length > 0 ? (
        <div className="product-grid">
          {props.products.map((product, index) => (
            <ProductCard key={product.sku} product={product} index={index} />
          ))}
        </div>
      ) : (
        <div className="catalog-empty" role="status">
          <h3>No products match these filters.</h3>
          <p>Reset the catalog filters or try a broader search.</p>
        </div>
      )}
    </>
  );
}
