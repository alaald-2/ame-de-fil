import { Prisma } from "@ame-de-fil/database";

export interface LockedInventoryRow {
  id: string;
  onHand: number;
  reserved: number;
}

// DATABASE.md §4: locks target InventoryItem rows with SELECT ... FOR
// UPDATE, in stable primary-key order, before verifying availability and
// reserving. Sorting the id list *and* asking Postgres to evaluate them in
// "ORDER BY id" is what actually makes the lock-acquisition order
// deterministic — two concurrent checkouts touching overlapping inventory
// items always attempt to acquire locks in the same order, so neither can
// ever deadlock the other (the classic "always lock in a consistent order"
// rule). Only meaningful inside an open transaction (`tx`) — a lock taken
// outside one releases immediately and protects nothing.
export async function lockInventoryItemsForUpdate(
  tx: Prisma.TransactionClient,
  inventoryItemIds: readonly string[],
): Promise<Map<string, LockedInventoryRow>> {
  if (inventoryItemIds.length === 0) return new Map();

  const sortedIds = [...new Set(inventoryItemIds)].sort();

  const rows = await tx.$queryRaw<LockedInventoryRow[]>(
    Prisma.sql`SELECT "id", "onHand", "reserved" FROM "InventoryItem" WHERE "id" IN (${Prisma.join(sortedIds)}) ORDER BY "id" FOR UPDATE`,
  );

  return new Map(rows.map((row) => [row.id, row]));
}
