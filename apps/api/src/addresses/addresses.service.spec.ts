import { describe, expect, it, vi } from "vitest";
import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { AddressesService } from "./addresses.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";

const NOW = new Date("2026-09-15T00:00:00.000Z");

function makeAddressRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "addr-1",
    userId: "user-1",
    label: null,
    name: "Ada Lovelace",
    line1: "Storgatan 1",
    line2: null,
    postalCode: "111 22",
    city: "Stockholm",
    country: "SE",
    phone: null,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// $transaction runs its callback against the same mocked prisma object —
// same idiom as auth.service.spec.ts's own makePrismaMock.
function makePrismaMock(overrides: Record<string, unknown> = {}) {
  const prisma: Record<string, unknown> = {
    address: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn(),
    },
    ...overrides,
  };
  prisma["$transaction"] = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma as unknown as PrismaService & {
    address: {
      count: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
}

describe("AddressesService.listMyAddresses", () => {
  it("scopes the query to the caller's own userId, ordered default-first then newest-first", async () => {
    const prisma = makePrismaMock();
    prisma.address.findMany.mockResolvedValue([makeAddressRow({ isDefault: true })]);
    const service = new AddressesService(prisma);

    const result = await service.listMyAddresses("user-1");

    expect(prisma.address.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: "addr-1", isDefault: true, country: "SE" });
  });
});

describe("AddressesService.getMyAddress", () => {
  it("returns 404 when the address does not exist at all", async () => {
    const prisma = makePrismaMock();
    const service = new AddressesService(prisma);

    await expect(service.getMyAddress("user-1", "addr-1")).rejects.toThrow(NotFoundException);
  });

  it("returns 404 for an address that exists but belongs to someone else", async () => {
    const prisma = makePrismaMock();
    prisma.address.findUnique.mockResolvedValue(makeAddressRow({ userId: "user-2" }));
    const service = new AddressesService(prisma);

    await expect(service.getMyAddress("user-1", "addr-1")).rejects.toThrow(NotFoundException);
  });

  it("returns the address for its real owner", async () => {
    const prisma = makePrismaMock();
    prisma.address.findUnique.mockResolvedValue(makeAddressRow());
    const service = new AddressesService(prisma);

    const result = await service.getMyAddress("user-1", "addr-1");

    expect(result.id).toBe("addr-1");
  });
});

describe("AddressesService.createAddress", () => {
  it("forces the first address a customer ever saves to be the default, regardless of the input", async () => {
    const prisma = makePrismaMock();
    prisma.address.count.mockResolvedValue(0);
    prisma.address.create.mockResolvedValue(makeAddressRow({ isDefault: true }));
    const service = new AddressesService(prisma);

    const result = await service.createAddress("user-1", {
      name: "Ada Lovelace",
      line1: "Storgatan 1",
      postalCode: "111 22",
      city: "Stockholm",
      isDefault: false,
    });

    expect(result.isDefault).toBe(true);
    expect(prisma.address.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true, country: "SE" }) }),
    );
    // Nothing to unset yet on a genuinely first address, but the transaction
    // still runs the unset-others step unconditionally when shouldBeDefault —
    // harmless no-op against an empty set.
    expect(prisma.address.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isDefault: true },
      data: { isDefault: false },
    });
  });

  it("a second address is not the default unless explicitly requested", async () => {
    const prisma = makePrismaMock();
    prisma.address.count.mockResolvedValue(1);
    prisma.address.create.mockResolvedValue(makeAddressRow({ isDefault: false }));
    const service = new AddressesService(prisma);

    await service.createAddress("user-1", {
      name: "Ada Lovelace",
      line1: "Storgatan 1",
      postalCode: "111 22",
      city: "Stockholm",
    });

    expect(prisma.address.updateMany).not.toHaveBeenCalled();
    expect(prisma.address.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: false }) }),
    );
  });

  it("requesting isDefault: true on a non-first address unsets every other default first", async () => {
    const prisma = makePrismaMock();
    prisma.address.count.mockResolvedValue(1);
    prisma.address.create.mockResolvedValue(makeAddressRow({ isDefault: true }));
    const service = new AddressesService(prisma);

    await service.createAddress("user-1", {
      name: "Ada Lovelace",
      line1: "Storgatan 1",
      postalCode: "111 22",
      city: "Stockholm",
      isDefault: true,
    });

    expect(prisma.address.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isDefault: true },
      data: { isDefault: false },
    });
  });

  it("throws 422 once the per-user cap is reached", async () => {
    const prisma = makePrismaMock();
    prisma.address.count.mockResolvedValue(20);
    const service = new AddressesService(prisma);

    await expect(
      service.createAddress("user-1", {
        name: "Ada Lovelace",
        line1: "Storgatan 1",
        postalCode: "111 22",
        city: "Stockholm",
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.address.create).not.toHaveBeenCalled();
  });
});

describe("AddressesService.updateAddress", () => {
  it("returns 404 for an address belonging to someone else — never applies the update", async () => {
    const prisma = makePrismaMock();
    prisma.address.findUnique.mockResolvedValue(makeAddressRow({ userId: "user-2" }));
    const service = new AddressesService(prisma);

    await expect(service.updateAddress("user-1", "addr-1", { city: "Göteborg" })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.address.update).not.toHaveBeenCalled();
  });

  it("only writes the fields actually provided", async () => {
    const prisma = makePrismaMock();
    prisma.address.findUnique.mockResolvedValue(makeAddressRow());
    prisma.address.update.mockResolvedValue(makeAddressRow({ city: "Göteborg" }));
    const service = new AddressesService(prisma);

    await service.updateAddress("user-1", "addr-1", { city: "Göteborg" });

    expect(prisma.address.update).toHaveBeenCalledWith({ where: { id: "addr-1" }, data: { city: "Göteborg" } });
  });

  it("isDefault: true unsets every other default for that user first", async () => {
    const prisma = makePrismaMock();
    prisma.address.findUnique.mockResolvedValue(makeAddressRow());
    prisma.address.update.mockResolvedValue(makeAddressRow({ isDefault: true }));
    const service = new AddressesService(prisma);

    await service.updateAddress("user-1", "addr-1", { isDefault: true });

    expect(prisma.address.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isDefault: true },
      data: { isDefault: false },
    });
    expect(prisma.address.update).toHaveBeenCalledWith({
      where: { id: "addr-1" },
      data: { isDefault: true },
    });
  });
});

describe("AddressesService.deleteAddress", () => {
  it("returns 404 for an address belonging to someone else — never deletes it", async () => {
    const prisma = makePrismaMock();
    prisma.address.findUnique.mockResolvedValue(makeAddressRow({ userId: "user-2" }));
    const service = new AddressesService(prisma);

    await expect(service.deleteAddress("user-1", "addr-1")).rejects.toThrow(NotFoundException);
    expect(prisma.address.delete).not.toHaveBeenCalled();
  });

  it("deleting a non-default address never touches any other row", async () => {
    const prisma = makePrismaMock();
    prisma.address.findUnique.mockResolvedValue(makeAddressRow({ isDefault: false }));
    const service = new AddressesService(prisma);

    await service.deleteAddress("user-1", "addr-1");

    expect(prisma.address.delete).toHaveBeenCalledWith({ where: { id: "addr-1" } });
    expect(prisma.address.findFirst).not.toHaveBeenCalled();
    expect(prisma.address.update).not.toHaveBeenCalled();
  });

  it("deleting the default address promotes the most-recently-created remaining one", async () => {
    const prisma = makePrismaMock();
    prisma.address.findUnique.mockResolvedValue(makeAddressRow({ isDefault: true }));
    prisma.address.findFirst.mockResolvedValue(makeAddressRow({ id: "addr-2", isDefault: false }));
    const service = new AddressesService(prisma);

    await service.deleteAddress("user-1", "addr-1");

    expect(prisma.address.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
    });
    expect(prisma.address.update).toHaveBeenCalledWith({
      where: { id: "addr-2" },
      data: { isDefault: true },
    });
  });

  it("deleting the last remaining (default) address leaves the customer with zero addresses — no promotion attempted", async () => {
    const prisma = makePrismaMock();
    prisma.address.findUnique.mockResolvedValue(makeAddressRow({ isDefault: true }));
    prisma.address.findFirst.mockResolvedValue(null);
    const service = new AddressesService(prisma);

    await service.deleteAddress("user-1", "addr-1");

    expect(prisma.address.update).not.toHaveBeenCalled();
  });
});
