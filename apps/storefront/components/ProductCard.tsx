import { CommerceProduct, formatPrice } from "../lib/commerce";

type ProductCardProps = {
  product: CommerceProduct;
  index: number;
};

export function ProductCard({ product, index }: ProductCardProps) {
  const category = product.categories[0] ?? "Field goods";
  const availability =
    product.stockStatus === "instock" ? "Ready to dispatch" : "Unavailable";

  return (
    <article className="product-card">
      <div className={`product-art art-${(index % 4) + 1}`} aria-hidden="true">
        <span>{product.name.slice(0, 1)}</span>
        <div />
      </div>
      <div className="product-copy">
        <div className="eyebrow-row">
          <p className="eyebrow">{category}</p>
          {product.featured ? <span className="featured">Field pick</span> : null}
        </div>
        <h3>{product.name}</h3>
        <p>{product.shortDescription}</p>
        <div className="product-meta">
          <strong>{formatPrice(product.price, product.currency)}</strong>
          <span className={product.stockStatus === "instock" ? "in-stock" : ""}>
            {availability}
          </span>
        </div>
      </div>
    </article>
  );
}
