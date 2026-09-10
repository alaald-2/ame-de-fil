import { describe, expect, it } from "vitest";
import { generateInitialPassword } from "./generate-password.ts";

describe("generateInitialPassword", () => {
  it("generates a non-trivially long, URL-safe string", () => {
    const password = generateInitialPassword();
    expect(password.length).toBeGreaterThanOrEqual(20);
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never generates the same value twice across many calls", () => {
    const passwords = new Set(Array.from({ length: 200 }, () => generateInitialPassword()));
    expect(passwords.size).toBe(200);
  });
});
