import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateAccountActionToken, hashAccountActionToken } from "./account-action-token.ts";

describe("generateAccountActionToken", () => {
  it("produces a base64url token with 256 bits of underlying entropy", () => {
    const token = generateAccountActionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("produces distinct tokens on repeated calls", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateAccountActionToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("hashAccountActionToken", () => {
  it("returns the sha256 hex digest of the token", () => {
    const token = "example-token-value";
    const expected = createHash("sha256").update(token).digest("hex");
    expect(hashAccountActionToken(token)).toBe(expected);
  });

  it("is deterministic for the same input", () => {
    const token = generateAccountActionToken();
    expect(hashAccountActionToken(token)).toBe(hashAccountActionToken(token));
  });

  it("hashes distinct tokens to distinct digests", () => {
    const a = generateAccountActionToken();
    const b = generateAccountActionToken();
    expect(hashAccountActionToken(a)).not.toBe(hashAccountActionToken(b));
  });

  it("never returns the raw token itself", () => {
    const token = generateAccountActionToken();
    expect(hashAccountActionToken(token)).not.toBe(token);
  });
});
