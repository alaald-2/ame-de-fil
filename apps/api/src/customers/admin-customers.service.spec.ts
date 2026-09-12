import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { Currency, Locale, OrderStatus, UserStatus } from "@ame-de-fil/database";
import { AdminCustomersService } from "./admin-customers.service.ts";
import { ADMIN_CUSTOMER_DETAIL_SELECT, ADMIN_CUSTOMER_LIST_SELECT } from "./mappers/admin-customer.mapper.ts";
import type { PrismaService } from "../database/prisma.service.ts";

function makePrisma(overrides: Record<string, unknown> = {}) {
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const findUnique = vi.fn().mockResolvedValue(null);

  const prisma = {
    user: { findMany, count, findUnique, ...(overrides["user"] as object | undefined) },
  };

  return { prisma: prisma as unknown as PrismaService, findMany, count, findUnique };
}

describe("AdminCustomersService.list", () => {
  it("queries with the exact admin-safe select, ordered most recently registered first", async () => {
    const { prisma, findMany, count } = makePrisma();
    const service = new AdminCustomersService(prisma);

    await service.list(1, 20);

    expect(findMany).toHaveBeenCalledWith({
      where: {},
      select: ADMIN_CUSTOMER_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    });
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("computes skip from page/pageSize", async () => {
    const { prisma, findMany } = makePrisma();
    const service = new AdminCustomersService(prisma);

    await service.list(3, 10);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });

  // Admin search (task: "add a proper search function to every important
  // list/table page") — Customers must be searchable by name, email, and
  // phone, all case-insensitive and by partial match. All three are plain
  // string columns on User itself, so this is a single OR — no raw SQL or
  // relation join needed (unlike Products/Orders' Article Number).
  it("searches by name, email, and phone via a single OR on User's own columns", async () => {
    const { prisma, findMany, count } = makePrisma();
    const service = new AdminCustomersService(prisma);

    await service.list(1, 20, "elin");

    const expectedWhere = {
      OR: [
        { email: { contains: "elin", mode: "insensitive" } },
        { firstName: { contains: "elin", mode: "insensitive" } },
        { lastName: { contains: "elin", mode: "insensitive" } },
        { phone: { contains: "elin", mode: "insensitive" } },
      ],
    };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("maps rows, joining first/last name and surfacing the order count", async () => {
    const { prisma } = makePrisma({
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "user-1",
            email: "anna@example.com",
            firstName: "Anna",
            lastName: "Andersson",
            status: UserStatus.ACTIVE,
            createdAt: new Date("2026-09-10T00:00:00.000Z"),
            lastLoginAt: new Date("2026-09-10T01:00:00.000Z"),
            _count: { orders: 3 },
          },
          {
            id: "user-2",
            email: "no-name@example.com",
            firstName: null,
            lastName: null,
            status: UserStatus.DISABLED,
            createdAt: new Date("2026-09-09T00:00:00.000Z"),
            lastLoginAt: null,
            _count: { orders: 0 },
          },
        ]),
        count: vi.fn().mockResolvedValue(2),
      },
    });
    const service = new AdminCustomersService(prisma);

    const result = await service.list(1, 20);

    expect(result).toEqual({
      items: [
        {
          id: "user-1",
          email: "anna@example.com",
          name: "Anna Andersson",
          status: UserStatus.ACTIVE,
          createdAt: "2026-09-10T00:00:00.000Z",
          lastLoginAt: "2026-09-10T01:00:00.000Z",
          orderCount: 3,
        },
        {
          id: "user-2",
          email: "no-name@example.com",
          name: null,
          status: UserStatus.DISABLED,
          createdAt: "2026-09-09T00:00:00.000Z",
          lastLoginAt: null,
          orderCount: 0,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
  });

  it("never surfaces anything beyond the admin-safe list fields (no passwordHash, no totpSecret)", async () => {
    const { prisma } = makePrisma({
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "user-1",
            email: "anna@example.com",
            firstName: "Anna",
            lastName: "Andersson",
            status: UserStatus.ACTIVE,
            createdAt: new Date(),
            lastLoginAt: null,
            _count: { orders: 0 },
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    });
    const service = new AdminCustomersService(prisma);

    const result = await service.list(1, 20);

    expect(Object.keys(result.items[0]!).sort()).toEqual(
      ["createdAt", "email", "id", "lastLoginAt", "name", "orderCount", "status"].sort(),
    );
  });
});

describe("AdminCustomersService.getDetail", () => {
  const DETAIL_ROW = {
    id: "user-1",
    email: "anna@example.com",
    firstName: "Anna",
    lastName: "Andersson",
    phone: "+46701234567",
    locale: Locale.sv_SE,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-05T00:00:00.000Z"),
    lastLoginAt: new Date("2026-09-10T00:00:00.000Z"),
    _count: { orders: 1 },
    orders: [
      {
        id: "order-1",
        orderNumber: "ORD-1",
        status: OrderStatus.CONFIRMED,
        totalMinor: 24700,
        currency: Currency.SEK,
        createdAt: new Date("2026-09-08T00:00:00.000Z"),
      },
    ],
  };

  it("returns 404 when the customer does not exist", async () => {
    const { prisma } = makePrisma({ user: { findUnique: vi.fn().mockResolvedValue(null) } });
    const service = new AdminCustomersService(prisma);

    await expect(service.getDetail("missing")).rejects.toThrow(NotFoundException);
  });

  it("queries with the exact admin-safe select", async () => {
    const { prisma } = makePrisma({ user: { findUnique: vi.fn().mockResolvedValue(DETAIL_ROW) } });
    const findUnique = (prisma as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } }).user
      .findUnique;
    const service = new AdminCustomersService(prisma);

    await service.getDetail("user-1");

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: ADMIN_CUSTOMER_DETAIL_SELECT,
    });
  });

  it("maps a full customer profile with recent order history", async () => {
    const { prisma } = makePrisma({ user: { findUnique: vi.fn().mockResolvedValue(DETAIL_ROW) } });
    const service = new AdminCustomersService(prisma);

    const result = await service.getDetail("user-1");

    expect(result).toEqual({
      id: "user-1",
      email: "anna@example.com",
      firstName: "Anna",
      lastName: "Andersson",
      phone: "+46701234567",
      locale: "sv-SE",
      status: UserStatus.ACTIVE,
      emailVerifiedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z",
      lastLoginAt: "2026-09-10T00:00:00.000Z",
      orderCount: 1,
      recentOrders: [
        {
          orderId: "order-1",
          orderNumber: "ORD-1",
          status: OrderStatus.CONFIRMED,
          total: { amountMinor: 24700, currency: "SEK" },
          createdAt: "2026-09-08T00:00:00.000Z",
        },
      ],
    });
  });

  it("never surfaces anything beyond the admin-safe detail fields (no passwordHash, no totpSecret)", async () => {
    const { prisma } = makePrisma({ user: { findUnique: vi.fn().mockResolvedValue(DETAIL_ROW) } });
    const service = new AdminCustomersService(prisma);

    const result = await service.getDetail("user-1");

    expect(Object.keys(result).sort()).toEqual(
      [
        "id",
        "email",
        "firstName",
        "lastName",
        "phone",
        "locale",
        "status",
        "emailVerifiedAt",
        "createdAt",
        "updatedAt",
        "lastLoginAt",
        "orderCount",
        "recentOrders",
      ].sort(),
    );
  });
});
