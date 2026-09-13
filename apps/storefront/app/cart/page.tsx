import type { Metadata } from "next";

import { CartPage } from "../../components/CartPage";

export const metadata: Metadata = {
  title: "Cart",
  description:
    "A synthetic persisted cart with authoritative WooCommerce price revalidation.",
};

export default function CartRoute() {
  return (
    <main className="cart-page shell" id="main-content">
      <header>
        <p className="eyebrow">Persisted field kit</p>
        <h1>Your cart</h1>
        <p>
          Cart state expires after seven days. Prices and availability are
          re-read from WooCommerce whenever the cart is viewed or changed.
        </p>
      </header>
      <CartPage />
    </main>
  );
}
