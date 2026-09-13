import type { Metadata } from "next";

import { SiteHeader } from "../components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Northstar Supply Co.",
    template: "%s · Northstar Supply Co.",
  },
  description:
    "A synthetic headless WooCommerce storefront for considered field goods.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteHeader />
        {children}
        <footer className="site-footer">
          <div className="shell footer-inner">
            <p>
              <strong>Northstar Supply Co.</strong>
              <br />
              A synthetic reference storefront.
            </p>
            <p>
              WordPress owns editorial content. WooCommerce owns products,
              prices, stock, and orders.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
