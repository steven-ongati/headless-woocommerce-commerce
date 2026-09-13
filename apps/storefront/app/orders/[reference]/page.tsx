import type { Metadata } from "next";

import { OrderPage } from "../../../components/OrderPage";

export const metadata: Metadata = {
  title: "Order status",
  description:
    "Authoritative WooCommerce order state and a durable support timeline.",
};

export default async function OrderRoute({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;

  return (
    <main className="order-page shell" id="main-content">
      <header>
        <p className="eyebrow">Durable checkout evidence</p>
        <h1>Order status</h1>
        <p>
          This view reads the WooCommerce order and its payment timeline. It
          does not infer payment or stock state from the browser.
        </p>
      </header>
      <OrderPage reference={reference} />
    </main>
  );
}
