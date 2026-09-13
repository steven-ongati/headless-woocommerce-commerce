import { CommerceProduct } from "../lib/commerce";
import { ProductCard } from "./ProductCard";

type CatalogProps =
  | { status: "ready"; products: CommerceProduct[] }
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
    <div className="product-grid">
      {props.products.map((product, index) => (
        <ProductCard key={product.sku} product={product} index={index} />
      ))}
    </div>
  );
}
