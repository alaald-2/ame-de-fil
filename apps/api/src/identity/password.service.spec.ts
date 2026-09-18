import { describe, expect, it } from "vitest";
import { PasswordService } from "./password.service.ts";

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

  // Pinned explicitly in password.service.ts rather than left to the
  // `argon2` package's library defaults — this proves the parameters are
  // actually embedded in every hash, not just declared in a constant no one
  // reads. Argon2's encoded hash format is
  // `$argon2id$v=19$m=<memoryCostKiB>,t=<timeCost>,p=<parallelism>$...`.
  it("embeds the pinned argon2id parameters (m=65536, t=3, p=4) in every hash", async () => {
    const hash = await service.hash("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$v=\d+\$m=65536,p=4,t=3\$/);
  });
});
