"use client";

import { useState } from "react";

type AddToCartButtonProps = {
  sku: string;
  available: boolean;
};

export function AddToCartButton({
  sku,
  available,
}: AddToCartButtonProps) {
  const [status, setStatus] = useState<"idle" | "adding" | "added" | "error">(
    "idle",
  );

  async function addToCart() {
    setStatus("adding");
    try {
      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      if (!response.ok) {
        throw new Error("Cart request failed.");
      }
      setStatus("added");
      window.dispatchEvent(new Event("cart:updated"));
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="add-to-cart">
      <button
        className="button product-button"
        disabled={!available || status === "adding"}
        onClick={addToCart}
        type="button"
      >
        {!available
          ? "Unavailable"
          : status === "adding"
            ? "Adding…"
            : status === "added"
              ? "Added"
              : "Add to cart"}
      </button>
      <span className="cart-action-status" role="status">
        {status === "error" ? "Cart unavailable. Try again." : ""}
      </span>
    </div>
  );
}
