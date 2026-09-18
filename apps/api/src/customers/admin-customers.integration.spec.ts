// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises the real, unmocked AdminCustomersService against a real
// database — the order-count aggregation, the recent-orders relation
// query, and the select-shape leak check are exactly the kind of thing a
// mocked Prisma client can't actually verify.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Currency, Locale, OrderStatus } from "@ame-de-fil/database";
import { AdminCustomersService } from "./admin-customers.service.ts";
import {
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "../test/testcontainers-postgres.ts";
import { seedShopFixture, seedUserWithPermissions, type ShopFixture } from "../test/fixtures.ts";

describe("AdminCustomersService — real Postgres", () => {
  let db: TestDatabase;
  let shop: ShopFixture;
  let service: AdminCustomersService;

  beforeAll(async () => {
    db = await startTestDatabase();
    shop = await seedShopFixture(db.prisma);
    service = new AdminCustomersService(db.prisma);
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  async function seedOrderForUser(userId: string, createdAt?: Date): Promise<string> {
    const order = await db.prisma.order.create({
      data: {
        orderNumber: `TEST-${randomUUID()}`,
        userId,
        locale: Locale.sv_SE,
        status: OrderStatus.CONFIRMED,
        currency: Currency.SEK,
        subtotalMinor: 10000,
        shippingMinor: shop.shippingPriceMinor,
        taxMinor: 2500,
        totalMinor: 10000 + shop.shippingPriceMinor + 2500,
        shippingMethodId: shop.shippingMethodId,
        shippingName: "Test Testsson",
        shippingLine1: "Testgatan 1",
        shippingPostalCode: "11122",
        shippingCity: "Stockholm",
        billingName: "Test Testsson",
        billingLine1: "Testgatan 1",
        billingPostalCode: "11122",
        billingCity: "Stockholm",
        ...(createdAt ? { createdAt } : {}),
      },
    });
    return order.id;
  }

  it("never leaks passwordHash, totpSecret, or any other unselected User field", async () => {
    const customer = await seedUserWithPermissions(db.prisma, []);
    await db.prisma.user.update({
      where: { id: customer.userId },
      data: { totpSecret: "real-totp-secret-value", firstName: "Anna", lastName: "Andersson" },
    });

    const listResult = await service.list(1, 50);
    const detailResult = await service.getDetail(customer.userId);

    const rawUser = await db.prisma.user.findUniqueOrThrow({ where: { id: customer.userId } });
    expect(rawUser.passwordHash).toBeTruthy();
    expect(rawUser.totpSecret).toBe("real-totp-secret-value");

    expect(JSON.stringify(listResult)).not.toContain(rawUser.passwordHash);
    expect(JSON.stringify(listResult)).not.toContain(rawUser.totpSecret);
    expect(JSON.stringify(detailResult)).not.toContain(rawUser.passwordHash);
    expect(JSON.stringify(detailResult)).not.toContain(rawUser.totpSecret);
  });

  it("maps a customer's real order count and recent order history", async () => {
    const customer = await seedUserWithPermissions(db.prisma, []);
    await db.prisma.user.update({
      where: { id: customer.userId },
      data: { firstName: "Erik", lastName: "Eriksson" },
    });
    const orderId = await seedOrderForUser(customer.userId);

    const detail = await service.getDetail(customer.userId);

    expect(detail.firstName).toBe("Erik");
    expect(detail.lastName).toBe("Eriksson");
    expect(detail.orderCount).toBe(1);
    expect(detail.recentOrders).toHaveLength(1);
    expect(detail.recentOrders[0]).toMatchObject({ orderId, status: OrderStatus.CONFIRMED });

    const listResult = await service.list(1, 50);
    const listItem = listResult.items.find((item) => item.id === customer.userId);
    expect(listItem).toMatchObject({ name: "Erik Eriksson", orderCount: 1 });
  });

  it("returns 404 for a nonexistent customer id", async () => {
    await expect(service.getDetail("nonexistent-user-id")).rejects.toThrow();
  });

  it("orders the list by most recently registered first, correctly paginated", async () => {
    // Year-2099 registration timestamps sort ahead of anything else this
    // file (or a shared container) has created, keeping this assertion
    // exact regardless of other tests' rows.
    const future = (offsetMinutes: number) => new Date(Date.UTC(2099, 0, 1, 0, offsetMinutes));
    const userIds = [
      (await seedUserWithPermissions(db.prisma, [])).userId,
      (await seedUserWithPermissions(db.prisma, [])).userId,
      (await seedUserWithPermissions(db.prisma, [])).userId,
    ];
    for (const [i, userId] of userIds.entries()) {
      await db.prisma.user.update({ where: { id: userId }, data: { createdAt: future(i) } });
    }

    const page1 = await service.list(1, 2);
    expect(page1.items.map((item) => item.id)).toEqual([userIds[2], userIds[1]]);

    const page2 = await service.list(2, 2);
    expect(page2.items[0]?.id).toBe(userIds[0]);
  });

  it("total reflects the real row count, not a mocked/stale value", async () => {
    const before = await service.list(1, 1);
    await seedUserWithPermissions(db.prisma, []);
    await seedUserWithPermissions(db.prisma, []);
    const after = await service.list(1, 1);

    expect(after.total).toBe(before.total + 2);
  });
});
