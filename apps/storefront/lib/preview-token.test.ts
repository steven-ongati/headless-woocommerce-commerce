import { describe, expect, it } from "vitest";

import {
  createPreviewSignature,
  isPreviewSessionActive,
  PREVIEW_TOKEN_LIFETIME_SECONDS,
  verifyPreviewToken,
} from "./preview-token";

const secret = "preview-secret-with-at-least-32-characters";
const now = 1_800_000_000;
const slug = "synthetic-field-note";

describe("preview tokens", () => {
  it("accepts a valid short-lived signature", () => {
    const expires = now + 300;
    expect(
      verifyPreviewToken({
        slug,
        expires: String(expires),
        signature: createPreviewSignature(slug, expires, secret),
        secret,
        now,
      }),
    ).toBe(true);
  });

  it("rejects expired, overlong, and modified tokens", () => {
    const expired = now - 1;
    const overlong = now + PREVIEW_TOKEN_LIFETIME_SECONDS + 1;

    expect(
      verifyPreviewToken({
        slug,
        expires: String(expired),
        signature: createPreviewSignature(slug, expired, secret),
        secret,
        now,
      }),
    ).toBe(false);
    expect(
      verifyPreviewToken({
        slug,
        expires: String(overlong),
        signature: createPreviewSignature(slug, overlong, secret),
        secret,
        now,
      }),
    ).toBe(false);
    expect(
      verifyPreviewToken({
        slug,
        expires: String(now + 300),
        signature: createPreviewSignature("other-note", now + 300, secret),
        secret,
        now,
      }),
    ).toBe(false);
  });

  it("expires the server-side preview session", () => {
    expect(isPreviewSessionActive(String(now + 1), now)).toBe(true);
    expect(isPreviewSessionActive(String(now - 1), now)).toBe(false);
    expect(isPreviewSessionActive("invalid", now)).toBe(false);
  });
});
