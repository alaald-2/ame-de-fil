import { describe, expect, it, vi } from "vitest";
import { AdminStoreSettingsService } from "./admin-store-settings.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";

const ACTOR_USER_ID = "user-1";

const ROW = {
  id: "singleton",
  businessName: "Âme de Fil",
  addressLine1: "Storgatan 1",
  addressLine2: null,
  postalCode: "111 22",
  city: "Stockholm",
  country: "Sverige",
  orgNumber: "556677-8899",
  vatNumber: "SE556677889901",
  phone: null,
  email: null,
  showAddress: true,
  showOrgNumber: true,
  showVatNumber: true,
  showPhone: false,
  showEmail: false,
  updatedAt: new Date("2026-09-11T00:00:00.000Z"),
};

describe("AdminStoreSettingsService.get", () => {
  it("upserts the singleton row (creating it with defaults on first read) and maps it", async () => {
    const upsert = vi.fn().mockResolvedValue(ROW);
    const prisma = { storeSettings: { upsert } } as unknown as PrismaService;
    const service = new AdminStoreSettingsService(prisma, new AuditService(prisma));

    const result = await service.get();

    expect(upsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    expect(result).toEqual({
      businessName: "Âme de Fil",
      addressLine1: "Storgatan 1",
      addressLine2: null,
      postalCode: "111 22",
      city: "Stockholm",
      country: "Sverige",
      orgNumber: "556677-8899",
      vatNumber: "SE556677889901",
      phone: null,
      email: null,
      showAddress: true,
      showOrgNumber: true,
      showVatNumber: true,
      showPhone: false,
      showEmail: false,
      updatedAt: "2026-09-11T00:00:00.000Z",
    });
  });
});

describe("AdminStoreSettingsService.update", () => {
  it("updates only the given fields and audit-logs a before/after snapshot", async () => {
    const upsert = vi.fn().mockResolvedValue(ROW);
    const update = vi.fn().mockResolvedValue({ ...ROW, businessName: "New name" });
    const auditLogCreate = vi.fn().mockResolvedValue({});
    const tx = { storeSettings: { update }, auditLog: { create: auditLogCreate } };
    const prisma = {
      storeSettings: { upsert },
      $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const service = new AdminStoreSettingsService(prisma, new AuditService(prisma));

    const result = await service.update({ businessName: "New name" }, ACTOR_USER_ID, "127.0.0.1");

    expect(update).toHaveBeenCalledWith({
      where: { id: "singleton" },
      data: { businessName: "New name" },
    });
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "store_settings.updated",
          actorUserId: ACTOR_USER_ID,
        }),
      }),
    );
    expect(result.businessName).toBe("New name");
  });
});
