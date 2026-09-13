import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="Northstar Supply home">
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span>
            <strong>Northstar</strong>
            <small>Supply Co.</small>
          </span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/#field-kit">Field kit</Link>
          <Link href="/field-notes/designing-for-the-repair-bench">
            Field notes
          </Link>
          <Link href="/#authority">Our approach</Link>
        </nav>
      </div>
    </header>
  );
}
