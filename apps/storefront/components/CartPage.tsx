"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { CartView } from "../lib/cart-contract";
import { formatPrice } from "../lib/money";

export function CartPage() {
  const [cart, setCart] = useState<CartView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/cart", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Cart request failed.");
        }
        const nextCart = (await response.json()) as CartView;
        if (active) {
          setCart(nextCart);
          setError("");
        }
      })
      .catch(() => {
        if (active) {
          setError("The cart service is temporarily unavailable.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function setQuantity(sku: string, quantity: number) {
    const response = await fetch("/api/cart", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sku, quantity }),
    });
    if (!response.ok) {
      setError("The cart could not be updated.");
      return;
    }
    setCart((await response.json()) as CartView);
    window.dispatchEvent(new Event("cart:updated"));
  }

  async function removeItem(sku: string) {
    const response = await fetch(`/api/cart?sku=${encodeURIComponent(sku)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setError("The cart item could not be removed.");
      return;
    }
    setCart((await response.json()) as CartView);
    window.dispatchEvent(new Event("cart:updated"));
  }

  if (!cart && !error) {
    return <p role="status">Loading the persisted cart…</p>;
  }

  if (!cart) {
    return <p role="alert">{error}</p>;
  }

  if (cart.lines.length === 0) {
    return (
      <div className="empty-cart">
        <p>Your field kit is empty.</p>
        <Link className="button button-primary" href="/#field-kit">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="cart-message" role="status">
        {error}
      </p>
      <div className="cart-lines">
        {cart.lines.map((line) => (
          <article className="cart-line" key={line.sku}>
            <div>
              <p className="eyebrow">{line.sku}</p>
              <h2>{line.name}</h2>
              <p>
                {line.currentPrice
                  ? formatPrice(line.currentPrice, line.currency)
                  : "No longer available"}
              </p>
              {line.priceChanged ? (
                <p className="price-change" role="status">
                  Price revalidated from{" "}
                  {formatPrice(line.capturedPrice, line.currency)}.
                </p>
              ) : null}
              {!line.available ? (
                <p className="price-change" role="status">
                  Remove this unavailable item before checkout.
                </p>
              ) : null}
            </div>
            <div className="cart-line-actions">
              <label htmlFor={`quantity-${line.sku}`}>Quantity</label>
              <select
                id={`quantity-${line.sku}`}
                onChange={(event) =>
                  void setQuantity(line.sku, Number(event.target.value))
                }
                value={line.quantity}
              >
                {Array.from({ length: 20 }, (_, index) => index + 1).map(
                  (quantity) => (
                    <option key={quantity} value={quantity}>
                      {quantity}
                    </option>
                  ),
                )}
              </select>
              <button
                className="text-button"
                onClick={() => void removeItem(line.sku)}
                type="button"
              >
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
      <aside className="cart-summary" aria-label="Cart summary">
        <p>
          <span>Items</span>
          <strong>{cart.itemCount}</strong>
        </p>
        <p>
          <span>Revalidated subtotal</span>
          <strong>{formatPrice(cart.subtotal, cart.currency)}</strong>
        </p>
        <p>
          Checkout and stock reservation arrive in Phase 3. This subtotal is
          read from WooCommerce and is not an order confirmation.
        </p>
      </aside>
    </div>
  );
}
