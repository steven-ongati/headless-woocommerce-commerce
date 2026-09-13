"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { CheckoutResult } from "../lib/checkout-contract";

export function CheckoutPanel() {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [email, setEmail] = useState("portfolio-buyer@example.test");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    idempotencyKey.current ??= crypto.randomUUID();

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const body = (await response.json()) as
        | CheckoutResult
        | { error?: string };
      if (!response.ok || !("order" in body)) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Checkout could not be started.",
        );
      }

      router.push(
        `/orders/${encodeURIComponent(body.order.reference)}`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Checkout is temporarily unavailable.",
      );
      setBusy(false);
    }
  }

  return (
    <form className="checkout-panel" onSubmit={submitCheckout}>
      <div>
        <p className="eyebrow">Synthetic checkout</p>
        <h2>Reserve stock before payment.</h2>
        <p>
          WooCommerce will reprice every line, create a pending order, and hold
          available stock for 15 minutes.
        </p>
      </div>
      <label htmlFor="checkout-email">Synthetic buyer email</label>
      <input
        autoComplete="email"
        id="checkout-email"
        onChange={(event) => setEmail(event.target.value)}
        pattern=".+\.test$"
        required
        type="email"
        value={email}
      />
      <button className="button button-primary" disabled={busy} type="submit">
        {busy ? "Reserving stock…" : "Create pending order"}
      </button>
      <p className="checkout-help">
        Local evidence only. No card number is collected or stored.
      </p>
      <p className="cart-message" role="alert">
        {error}
      </p>
    </form>
  );
}
