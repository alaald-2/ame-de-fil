import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./normalize-email.ts";

describe("normalizeEmail", () => {
  it("lowercases the email", () => {
    expect(normalizeEmail("Customer@Example.com")).toBe("customer@example.com");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeEmail("  customer@example.com  ")).toBe("customer@example.com");
  });

  it("is idempotent", () => {
    const once = normalizeEmail("  Customer@Example.com  ");
    expect(normalizeEmail(once)).toBe(once);
  });
});
