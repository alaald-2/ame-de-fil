import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateOrderStatusToken, hashOrderStatusToken } from "./order-status-token.ts";

describe("generateOrderStatusToken", () => {
  it("produces a base64url token with 256 bits of underlying entropy", () => {
    const token = generateOrderStatusToken();

    // 32 raw bytes -> 43 base64url characters (no padding).
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("produces distinct tokens on repeated calls", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateOrderStatusToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("hashOrderStatusToken", () => {
  it("returns the sha256 hex digest of the token", () => {
    const token = "example-token-value";
    const expected = createHash("sha256").update(token).digest("hex");

    expect(hashOrderStatusToken(token)).toBe(expected);
  });

  it("is deterministic for the same input", () => {
    const token = generateOrderStatusToken();
    expect(hashOrderStatusToken(token)).toBe(hashOrderStatusToken(token));
  });

  it("hashes distinct tokens to distinct digests", () => {
    const a = generateOrderStatusToken();
    const b = generateOrderStatusToken();
    expect(hashOrderStatusToken(a)).not.toBe(hashOrderStatusToken(b));
  });

  it("never returns the raw token itself", () => {
    const token = generateOrderStatusToken();
    expect(hashOrderStatusToken(token)).not.toBe(token);
  });
});
