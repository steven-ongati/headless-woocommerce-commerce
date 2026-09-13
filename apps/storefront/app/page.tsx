import Link from "next/link";

import { Catalog } from "../components/Catalog";
import { CatalogFilters } from "../components/CatalogFilters";
import {
  CatalogSearchOptions,
  searchCatalog,
} from "../lib/projection";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const options = readSearchOptions(params);
  const catalog = await searchCatalog(options)
    .then((result) => ({ status: "ready" as const, ...result }))
    .catch(() => ({ status: "unavailable" as const }));
  const categories = catalog.status === "ready" ? catalog.categories : [];

  return (
    <main id="main-content">
      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow">Synthetic goods · Real architecture</p>
          <h1>Pack light. Go deliberately.</h1>
          <p className="hero-lede">
            Field equipment selected for repairability, quiet utility, and the
            miles that begin after the obvious route ends.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#field-kit">
              Explore the field kit
            </a>
            <Link
              className="text-link"
              href="/field-notes/designing-for-the-repair-bench"
            >
              Read our field notes <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
        <div className="hero-art" aria-label="Abstract mountain field study">
          <div className="sun" />
          <div className="ridge ridge-back" />
          <div className="ridge ridge-front" />
          <div className="route-line" />
          <p>44.4279° N<br />110.5885° W</p>
        </div>
      </section>

      <section className="value-strip" aria-label="Store principles">
        <div className="shell value-grid">
          <p><span>01</span> Repairable by design</p>
          <p><span>02</span> Synthetic catalog</p>
          <p><span>03</span> Authoritative inventory</p>
        </div>
      </section>

      <section className="catalog-section shell" id="field-kit">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The field kit</p>
            <h2>Fewer things. Better reasons.</h2>
          </div>
          <p>
            Product, price, category, and stock data are read at request time
            from WooCommerce.
          </p>
        </div>
        <CatalogFilters categories={categories} values={options} />
        <Catalog {...catalog} />
      </section>

      <section className="story-panel shell">
        <div className="story-number" aria-hidden="true">01</div>
        <div className="story-copy">
          <p className="eyebrow">Field note</p>
          <h2>Designed for the repair bench.</h2>
          <p>
            We start with the parts most likely to wear, then make those parts
            reachable, replaceable, and documented.
          </p>
          <Link
            className="text-link"
            href="/field-notes/designing-for-the-repair-bench"
          >
            Read the note <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="authority-section shell" id="authority">
        <div>
          <p className="eyebrow">The authority boundary</p>
          <h2>Headless, not disconnected.</h2>
        </div>
        <div className="authority-grid">
          <article>
            <span>WP</span>
            <h3>Editorial system</h3>
            <p>WordPress owns field notes, publication state, and revisions.</p>
          </article>
          <article>
            <span>WC</span>
            <h3>Commerce system</h3>
            <p>WooCommerce owns products, prices, stock, customers, and orders.</p>
          </article>
          <article>
            <span>NX</span>
            <h3>Experience layer</h3>
            <p>Next.js presents server-rendered projections without becoming authority.</p>
          </article>
        </div>
      </section>
    </main>
  );
}

function readSearchOptions(
  params: Record<string, string | string[] | undefined>,
): CatalogSearchOptions {
  const availability = firstValue(params.availability);
  const sort = firstValue(params.sort);

  return {
    query: firstValue(params.q),
    category: firstValue(params.category),
    availability:
      availability === "instock" || availability === "outofstock"
        ? availability
        : undefined,
    sort:
      sort === "name" ||
      sort === "price-asc" ||
      sort === "price-desc" ||
      sort === "featured"
        ? sort
        : "featured",
  };
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
