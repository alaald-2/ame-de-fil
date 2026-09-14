import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { UserStatus } from "@ame-de-fil/database";
import { SessionService } from "./session.service.js";
import type { PrismaService } from "../database/prisma.service.js";

function makePrismaMock() {
  return {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  } as unknown as PrismaService;
}

function makeConfigMock(ttlHours = 168): ConfigService<Env, true> {
  return { get: () => ttlHours } as unknown as ConfigService<Env, true>;
}

describe("SessionService", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: SessionService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new SessionService(prisma, makeConfigMock());
  });

  it("creates a session with a random opaque token and csrf token, persisted via Prisma", async () => {
    const result = await service.createSession({ userId: "user-1" });

    expect(result.token).toHaveLength(43); // base64url of 32 random bytes
    expect(result.csrfToken).toHaveLength(43);
    expect(result.token).not.toBe(result.csrfToken);
    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: result.token,
          csrfToken: result.csrfToken,
          userId: "user-1",
        }),
      }),
    );
  });

  it("returns null for a token that doesn't exist", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);
    await expect(service.validateSession("nonexistent")).resolves.toBeNull();
  });

  it("returns null for an expired session", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "tok",
      userId: "user-1",
      csrfToken: "csrf",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      user: { roles: [] },
    } as never);
    await expect(service.validateSession("tok")).resolves.toBeNull();
  });

  it("returns null for a revoked session", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "tok",
      userId: "user-1",
      csrfToken: "csrf",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 10_000),
      user: { roles: [] },
    } as never);
    await expect(service.validateSession("tok")).resolves.toBeNull();
  });

  it("returns null for a still-valid, unrevoked session whose user has since been disabled", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "tok",
      userId: "user-1",
      csrfToken: "csrf",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 10_000),
      user: { status: UserStatus.DISABLED, roles: [] },
    } as never);
    await expect(service.validateSession("tok")).resolves.toBeNull();
  });

  it("flattens roles -> permissions into a deduplicated set for a valid session", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "tok",
      userId: "user-1",
      csrfToken: "csrf-value",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 10_000),
      user: {
        status: UserStatus.ACTIVE,
        roles: [
          {
            role: {
              permissions: [
                { permission: { key: "orders.view" } },
                { permission: { key: "orders.refund" } },
              ],
            },
          },
          {
            role: {
              permissions: [{ permission: { key: "orders.view" } }],
            },
          },
        ],
      },
    } as never);

    const auth = await service.validateSession("tok");
    expect(auth).toEqual({
      userId: "user-1",
      sessionId: "tok",
      csrfToken: "csrf-value",
      permissions: ["orders.view", "orders.refund"],
      emailVerifiedAt: undefined,
    });
  });

  it("carries the real user.emailVerifiedAt through onto the returned AuthContext", async () => {
    const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "tok",
      userId: "user-1",
      csrfToken: "csrf",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 10_000),
      user: { status: UserStatus.ACTIVE, roles: [], emailVerifiedAt: verifiedAt },
    } as never);

    const auth = await service.validateSession("tok");
    expect(auth?.emailVerifiedAt).toEqual(verifiedAt);
  });

  it("carries a null user.emailVerifiedAt through as null (not yet verified)", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "tok",
      userId: "user-1",
      csrfToken: "csrf",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 10_000),
      user: { status: UserStatus.ACTIVE, roles: [], emailVerifiedAt: null },
    } as never);

    const auth = await service.validateSession("tok");
    expect(auth?.emailVerifiedAt).toBeNull();
  });

  it("revokes a session by setting revokedAt via updateMany, scoped to not-already-revoked", async () => {
    await service.revokeSession("tok");
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: "tok", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
