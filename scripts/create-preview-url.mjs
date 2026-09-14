import { createHmac } from "node:crypto";

const slug = process.argv[2] ?? "";
const secret = process.env.COMMERCE_PREVIEW_SECRET ?? "";
const origin = process.env.STOREFRONT_ORIGIN ?? "http://localhost:3000";

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  throw new Error("Pass a valid field-note slug.");
}
if (secret.length < 32) {
  throw new Error("COMMERCE_PREVIEW_SECRET must contain at least 32 characters.");
}

const expires = Math.floor(Date.now() / 1_000) + 10 * 60;
const signature = createHmac("sha256", secret)
  .update(`${slug}:${expires}`)
  .digest("hex");
const previewUrl = new URL("/api/preview", origin);
previewUrl.searchParams.set("slug", slug);
previewUrl.searchParams.set("expires", String(expires));
previewUrl.searchParams.set("signature", signature);

process.stdout.write(`${previewUrl}\n`);
