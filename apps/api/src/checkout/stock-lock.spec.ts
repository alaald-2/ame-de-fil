import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@ame-de-fil/database";
import { lockInventoryItemsForUpdate } from "./stock-lock.ts";

describe("lockInventoryItemsForUpdate", () => {
  it("returns an empty map without querying for an empty id list", async () => {
    const queryRaw = vi.fn();
    const tx = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;

    const result = await lockInventoryItemsForUpdate(tx, []);

    expect(result.size).toBe(0);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("issues a FOR UPDATE query with ids deduplicated and sorted ascending", async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      { id: "inv-1", onHand: 10, reserved: 2 },
      { id: "inv-2", onHand: 5, reserved: 0 },
    ]);
    const tx = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;

    const result = await lockInventoryItemsForUpdate(tx, ["inv-2", "inv-1", "inv-2"]);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sqlArg = queryRaw.mock.calls[0]?.[0] as { values: string[]; sql: string };
    expect(sqlArg.values).toEqual(["inv-1", "inv-2"]); // deduplicated, sorted
    expect(sqlArg.sql).toMatch(/FOR UPDATE/);
    expect(sqlArg.sql).toMatch(/ORDER BY/);

    expect(result.get("inv-1")).toEqual({ id: "inv-1", onHand: 10, reserved: 2 });
    expect(result.get("inv-2")).toEqual({ id: "inv-2", onHand: 5, reserved: 0 });
  });
});
