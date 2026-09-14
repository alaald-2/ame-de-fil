import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateLoginOtpCode, hashLoginOtpCode } from "./login-otp.ts";

describe("generateLoginOtpCode", () => {
  it("produces a 6-digit, zero-padded numeric string", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateLoginOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("produces varied codes on repeated calls (not a fixed value)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateLoginOtpCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("hashLoginOtpCode", () => {
  it("returns the sha256 hex digest of the code", () => {
    const code = "042017";
    const expected = createHash("sha256").update(code).digest("hex");
    expect(hashLoginOtpCode(code)).toBe(expected);
  });

  it("is deterministic for the same input", () => {
    expect(hashLoginOtpCode("123456")).toBe(hashLoginOtpCode("123456"));
  });

  it("hashes distinct codes to distinct digests", () => {
    expect(hashLoginOtpCode("111111")).not.toBe(hashLoginOtpCode("222222"));
  });

  it("never returns the raw code itself", () => {
    expect(hashLoginOtpCode("123456")).not.toBe("123456");
  });
});
