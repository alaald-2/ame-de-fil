import { describe, expect, it } from "vitest";
import { PasswordService } from "./password.service.js";

// Real argon2 hashing/verification — no mocks, no database needed.
describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes a password as an argon2id hash", async () => {
    const hash = await service.hash("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it("verifies a correct password against its hash", async () => {
    const hash = await service.hash("correct horse battery staple");
    await expect(service.verify(hash, "correct horse battery staple")).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await service.hash("correct horse battery staple");
    await expect(service.verify(hash, "wrong password")).resolves.toBe(false);
  });

  it("produces a different hash for the same password each time (random salt)", async () => {
    const [a, b] = await Promise.all([service.hash("same input"), service.hash("same input")]);
    expect(a).not.toBe(b);
  });
});
