"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { CartView } from "../lib/cart-contract";

export function CartIndicator() {
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    async function updateCartCount() {
      const response = await fetch("/api/cart", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const cart = (await response.json()) as CartView;
      setItemCount(cart.itemCount);
    }

    void updateCartCount();
    window.addEventListener("cart:updated", updateCartCount);
    return () => window.removeEventListener("cart:updated", updateCartCount);
  }, []);

  return (
    <Link className="cart-indicator" href="/cart">
      Cart <span aria-label={`${itemCount} items`}>{itemCount}</span>
    </Link>
  );
}
