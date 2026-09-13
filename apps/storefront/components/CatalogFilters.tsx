import Link from "next/link";

import type { CatalogSearchOptions } from "../lib/projection";

type CatalogFiltersProps = {
  categories: string[];
  values: CatalogSearchOptions;
};

export function CatalogFilters({
  categories,
  values,
}: CatalogFiltersProps) {
  return (
    <form className="catalog-filters" action="/#field-kit" method="get">
      <div className="filter-field filter-search">
        <label htmlFor="catalog-query">Search the field kit</label>
        <input
          defaultValue={values.query}
          id="catalog-query"
          maxLength={80}
          name="q"
          placeholder="Pack, light, mug…"
          type="search"
        />
      </div>
      <div className="filter-field">
        <label htmlFor="catalog-category">Category</label>
        <select
          defaultValue={values.category ?? ""}
          id="catalog-category"
          name="category"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-field">
        <label htmlFor="catalog-availability">Availability</label>
        <select
          defaultValue={values.availability ?? ""}
          id="catalog-availability"
          name="availability"
        >
          <option value="">Any availability</option>
          <option value="instock">In stock</option>
          <option value="outofstock">Out of stock</option>
        </select>
      </div>
      <div className="filter-field">
        <label htmlFor="catalog-sort">Sort</label>
        <select
          defaultValue={values.sort ?? "featured"}
          id="catalog-sort"
          name="sort"
        >
          <option value="featured">Featured</option>
          <option value="name">Name</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
      </div>
      <div className="filter-actions">
        <button className="button button-primary" type="submit">
          Apply filters
        </button>
        <Link className="text-link" href="/#field-kit">
          Reset
        </Link>
      </div>
    </form>
  );
}
