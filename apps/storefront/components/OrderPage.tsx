"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type {
  CheckoutResult,
  OrderView,
} from "../lib/checkout-contract";
import { formatPrice } from "../lib/money";

type OrderResponse = {
  order: OrderView;
  paymentMode: CheckoutResult["paymentMode"];
};

export function OrderPage({ reference }: { reference: string }) {
  const [result, setResult] = useState<OrderResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"confirm" | "cancel" | "">("");

  useEffect(() => {
    let active = true;
    fetch(`/api/orders/${encodeURIComponent(reference)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as
          | OrderResponse
          | { error?: string };
        if (!response.ok || !("order" in body)) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "The order could not be loaded.",
          );
        }
        if (active) {
          setResult(body);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The order could not be loaded.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [reference]);

  async function orderAction(action: "confirm" | "cancel") {
    setBusy(action);
    setError("");
    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(reference)}/${action}`,
        { method: "POST" },
      );
      const body = (await response.json()) as
        | OrderResponse
        | OrderView
        | { error?: string };
      if (!response.ok || !("status" in body || "order" in body)) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "The order could not be updated.",
        );
      }
      setResult(
        "order" in body
          ? body
          : {
              order: body,
              paymentMode: result?.paymentMode ?? "simulator",
            },
      );
      window.dispatchEvent(new Event("cart:updated"));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The order could not be updated.",
      );
    } finally {
      setBusy("");
    }
  }

  if (!result && !error) {
    return <p role="status">Loading the authoritative order…</p>;
  }
  if (!result) {
    return (
      <div className="order-unavailable">
        <p role="alert">{error}</p>
        <Link className="text-link" href="/cart">
          Return to cart
        </Link>
      </div>
    );
  }

  const { order, paymentMode } = result;
  const isPending = order.status === "pending";
  const isPaid = ["processing", "completed"].includes(order.status);

  return (
    <div className="order-layout">
      <section className="order-card" aria-labelledby="order-summary-heading">
        <div className="order-status-row">
          <p className="eyebrow">WooCommerce order</p>
          <span className={`order-status order-status-${order.status}`}>
            {order.status}
          </span>
        </div>
        <h2 id="order-summary-heading">{order.reference}</h2>
        <p>
          {isPaid
            ? "Payment accepted. WooCommerce reduced stock exactly once."
            : isPending
              ? `Stock is held until ${formatDate(order.holdExpiresAt)}.`
              : "This order is closed and no stock remains reserved."}
        </p>
        <dl className="order-facts">
          <div>
            <dt>Authoritative total</dt>
            <dd>{formatPrice(order.amount, order.currency)}</dd>
          </div>
          <div>
            <dt>Buyer</dt>
            <dd>{order.email}</dd>
          </div>
          <div>
            <dt>Payment path</dt>
            <dd>
              {paymentMode === "simulator"
                ? "Signed local simulator"
                : "Stripe test mode"}
            </dd>
          </div>
        </dl>
        <ul className="order-items">
          {order.items.map((item) => (
            <li key={item.sku}>
              <span>
                {item.name} × {item.quantity}
              </span>
              <strong>{formatPrice(item.total, order.currency)}</strong>
            </li>
          ))}
        </ul>
        {isPending ? (
          <div className="order-actions">
            <button
              className="button button-primary"
              disabled={busy !== ""}
              onClick={() => void orderAction("confirm")}
              type="button"
            >
              {busy === "confirm" ? "Confirming…" : "Complete test payment"}
            </button>
            <button
              className="text-button"
              disabled={busy !== ""}
              onClick={() => void orderAction("cancel")}
              type="button"
            >
              Cancel and release stock
            </button>
          </div>
        ) : (
          <Link className="text-link" href="/#field-kit">
            Return to the field kit
          </Link>
        )}
        <p className="cart-message" role="alert">
          {error}
        </p>
      </section>

      <aside className="timeline-panel" aria-labelledby="timeline-heading">
        <p className="eyebrow">Support evidence</p>
        <h2 id="timeline-heading">Order timeline</h2>
        <ol>
          {order.timeline.map((entry) => (
            <li key={`${entry.at}-${entry.type}`}>
              <time dateTime={entry.at}>{formatDate(entry.at)}</time>
              <strong>{entry.type.replaceAll(".", " ")}</strong>
              <p>{entry.message}</p>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "an unknown time"
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date) + " UTC";
}
