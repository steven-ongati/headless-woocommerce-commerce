import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="not-found shell">
      <p className="eyebrow">404 · Off route</p>
      <h1>This field note could not be found.</h1>
      <p>It may be unpublished, mistyped, or no longer part of the route.</p>
      <Link className="button button-primary" href="/">
        Return to the storefront
      </Link>
    </main>
  );
}
