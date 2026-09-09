import { Prisma, StockReservationStatus } from "@ame-de-fil/database";

export interface LockedReservationRow {
  id: string;
  status: StockReservationStatus;
  quantity: number;
  inventoryItemId: string;
  orderItemId: string;
}

// Mirrors checkout/stock-lock.ts's SELECT ... FOR UPDATE convention, applied
// to a single order's StockReservation rows rather than InventoryItem rows.
// Locking here (rather than reading, deciding CONFIRMED-vs-STOCK_LOST in
// application code, and only then writing) is what makes the decision
// race-safe: a plain read-then-write would have a genuine TOCTOU gap
// against the concurrent reservation-expiry sweep (DATABASE.md §4) — the
// expiry job could flip a reservation PENDING -> EXPIRED between our read
// and our write, and we'd wrongly decide "all still PENDING" from stale
// data. Once locked here, no other transaction can change these rows until
// this one commits, so the statuses read immediately after are safe to act
// on directly (plain .update() calls, not a second guarded updateMany).
export async function lockOrderReservationsForUpdate(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<LockedReservationRow[]> {
  return tx.$queryRaw<LockedReservationRow[]>(
    Prisma.sql`
      SELECT sr."id", sr."status", sr."quantity", sr."inventoryItemId", sr."orderItemId"
      FROM "StockReservation" sr
      JOIN "OrderItem" oi ON oi."id" = sr."orderItemId"
      WHERE oi."orderId" = ${orderId}
      ORDER BY sr."id"
      FOR UPDATE OF sr
    `,
  );
}
