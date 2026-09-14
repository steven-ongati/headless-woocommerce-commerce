import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export const PREVIEW_EXPIRY_COOKIE = "commerce_preview_expires";
export const PREVIEW_TOKEN_LIFETIME_SECONDS = 10 * 60;

export function createPreviewSignature(
  slug: string,
  expires: number,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`${slug}:${expires}`)
    .digest("hex");
}

export function verifyPreviewToken(input: {
  slug: string;
  expires: string;
  signature: string;
  secret: string;
  now?: number;
}): boolean {
  if (!isValidSlug(input.slug) || input.secret.length < 32) {
    return false;
  }

  const expires = Number(input.expires);
  const now = input.now ?? Math.floor(Date.now() / 1_000);
  if (
    !Number.isSafeInteger(expires) ||
    expires < now ||
    expires > now + PREVIEW_TOKEN_LIFETIME_SECONDS
  ) {
    return false;
  }

  const expected = createPreviewSignature(
    input.slug,
    expires,
    input.secret,
  );
  if (
    input.signature.length !== expected.length ||
    !/^[a-f0-9]+$/i.test(input.signature)
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(input.signature, "hex"),
    Buffer.from(expected, "hex"),
  );
}

export function isPreviewSessionActive(
  expires: string | undefined,
  now = Math.floor(Date.now() / 1_000),
): boolean {
  const expiry = Number(expires);
  return Number.isSafeInteger(expiry) && expiry >= now;
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
