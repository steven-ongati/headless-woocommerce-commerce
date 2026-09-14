import { NextRequest, NextResponse } from "next/server";

import {
  PaymentError,
  processStripeWebhook,
  publicOrder,
} from "../../../../lib/payment";
import { incrementMetric } from "../../../../lib/operational-metrics";
import { withRequestTrace } from "../../../../lib/request-trace";
import { GatewayError } from "../../../../lib/wordpress-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withRequestTrace(request, async () => handleWebhook(request));
}

async function handleWebhook(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.text();
    const signature = request.headers.get("stripe-signature") ?? "";
    const result = await processStripeWebhook(payload, signature);
    await incrementMetric(
      result.duplicate ? "callback.duplicate" : "callback.accepted",
    ).catch(() => undefined);

    return NextResponse.json(
      {
        duplicate: result.duplicate,
        order: publicOrder(result.order),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    await incrementMetric("callback.rejected").catch(() => undefined);
    const known = error instanceof PaymentError || error instanceof GatewayError;
    return NextResponse.json(
      {
        error: known
          ? error.message
          : "The payment callback could not be processed.",
      },
      {
        status: known ? error.status : 503,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
}
