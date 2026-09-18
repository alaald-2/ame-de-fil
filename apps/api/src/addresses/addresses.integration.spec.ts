// Integration test (TESTING.md §3 — Vitest + Testcontainers, real Postgres).
// Exercises AddressesService against a real database — the default-
// exclusivity transaction and the per-user cap are exactly the kind of
// thing a mocked Prisma client can't actually verify (same reasoning as
// orders.integration.spec.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { AddressesService } from "./addresses.service.ts";
import {
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "../test/testcontainers-postgres.ts";
import { seedUserWithPermissions } from "../test/fixtures.ts";

const BASE_INPUT = {
  name: "Ada Lovelace",
  line1: "Storgatan 1",
  postalCode: "111 22",
  city: "Stockholm",
};

describe("AddressesService — real Postgres", () => {
  let db: TestDatabase;
  let service: AddressesService;

  beforeAll(async () => {
    db = await startTestDatabase();
    service = new AddressesService(db.prisma);
  });

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  it("the first address a customer saves is forced default, even when isDefault: false is sent", async () => {
    const user = await seedUserWithPermissions(db.prisma, []);

    const address = await service.createAddress(user.userId, { ...BASE_INPUT, isDefault: false });

    expect(address.isDefault).toBe(true);
  });

  it("only one address is ever the default at a time for a given customer", async () => {
    const user = await seedUserWithPermissions(db.prisma, []);
    const first = await service.createAddress(user.userId, BASE_INPUT);
    const second = await service.createAddress(user.userId, {
      ...BASE_INPUT,
      city: "Göteborg",
      isDefault: true,
    });

    const list = await service.listMyAddresses(user.userId);

    const defaults = list.items.filter((a) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.id).toBe(second.id);
    expect(list.items.find((a) => a.id === first.id)!.isDefault).toBe(false);
  });

  it("deleting the default address promotes the most-recently-created remaining one", async () => {
    const user = await seedUserWithPermissions(db.prisma, []);
    const first = await service.createAddress(user.userId, BASE_INPUT);
    const second = await service.createAddress(user.userId, { ...BASE_INPUT, city: "Göteborg" });

    await service.deleteAddress(user.userId, first.id);

    const list = await service.listMyAddresses(user.userId);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id: second.id, isDefault: true });
  });

  it("deleting the only address leaves the customer with zero addresses, not an error", async () => {
    const user = await seedUserWithPermissions(db.prisma, []);
    const only = await service.createAddress(user.userId, BASE_INPUT);

    await service.deleteAddress(user.userId, only.id);

    const list = await service.listMyAddresses(user.userId);
    expect(list.items).toHaveLength(0);
  });

  it("throws 422 once a customer reaches the per-user address cap", async () => {
    const user = await seedUserWithPermissions(db.prisma, []);
    for (let i = 0; i < 20; i++) {
      await service.createAddress(user.userId, { ...BASE_INPUT, line1: `Storgatan ${i}` });
    }

    await expect(service.createAddress(user.userId, BASE_INPUT)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it("getMyAddress/updateAddress/deleteAddress all return 404 — never the data — for a real address owned by someone else", async () => {
    const owner = await seedUserWithPermissions(db.prisma, []);
    const other = await seedUserWithPermissions(db.prisma, []);
    const address = await service.createAddress(owner.userId, BASE_INPUT);

    await expect(service.getMyAddress(other.userId, address.id)).rejects.toThrow(NotFoundException);
    await expect(
      service.updateAddress(other.userId, address.id, { city: "Malmö" }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.deleteAddress(other.userId, address.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});
