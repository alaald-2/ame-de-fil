// Integration tests (TESTING.md §3 — Vitest + Testcontainers, real Postgres,
// no mocked Prisma client). This is "the single highest-value test this
// feature doesn't have yet" flagged in ROADMAP.md's Phase 3 section: the
// webhook-vs-reservation-expiry race, and webhook/reservation-release
// idempotency, exercised against a real database and the project's real,
// unmocked service classes — exactly the layer where the lineTaxMinor and
// P2002-adapter-shape defects (fixed in this same checkpoint) were only
// ever actually reachable.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "@ame-de-fil/config";
import { OrderStatus, PaymentStatus, StockReservationStatus } from "@ame-de-fil/database";
import { PaymentsWebhookService } from "../payments/payments-webhook.service.ts";
import { ReservationExpiryService } from "./reservation-expiry.service.ts";
import type { VerifiedWebhookEvent } from "../payments/payment-provider.ts";
import { NotificationsService } from "../notifications/notifications.service.ts";
import { PendingEmailProvider } from "../notifications/email-provider.ts";
import {
  startTestDatabase,
  stopTestDatabase,
  type TestDatabase,
} from "../test/testcontainers-postgres.ts";
import {
  seedShopFixture,
  seedVariant,
  seedPendingOrder,
  type ShopFixture,
  type VariantFixture,
} from "../test/fixtures.ts";

// Real ReservationExpiryService needs CHECKOUT_RESERVATION_TTL_MINUTES —
// matches env.ts's own default (15) so this file's cutoff arithmetic stays
// predictable regardless of what a real .env sets it to.
const RESERVATION_TTL_MINUTES = 15;
function makeConfig(): ConfigService<Env, true> {
  return { get: () => RESERVATION_TTL_MINUTES } as unknown as ConfigService<Env, true>;
}

function succeededEvent(providerPaymentIntentId: string, eventId: string): VerifiedWebhookEvent {
  return {
    providerEventId: eventId,
    eventType: "payment_intent.succeeded",
    providerPaymentIntentId,
    outcome: "succeeded",
    raw: { id: eventId },
  };
}

describe("reservation expiry vs. payment-success — real Postgres", () => {
  let db: TestDatabase;
  let shop: ShopFixture;
  let variant: VariantFixture;
  let reservationExpiry: ReservationExpiryService;
  let webhook: PaymentsWebhookService;

  beforeAll(async () => {
    db = await startTestDatabase();
    shop = await seedShopFixture(db.prisma);
    reservationExpiry = new ReservationExpiryService(db.prisma, makeConfig());
    // PendingEmailProvider — no real SMTP container in this integration
    // harness (TESTING.md §3), same posture as
    // notifications.integration.spec.ts. NotificationsService never throws,
    // so this can't affect any assertion in this file about order/
    // reservation state.
    webhook = new PaymentsWebhookService(
      db.prisma,
      new NotificationsService(db.prisma, new PendingEmailProvider(), makeConfig()),
    );
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(db);
  });

  beforeEach(async () => {
    // A fresh InventoryItem per test — onHand/reserved must never carry
    // over between tests sharing this file's one container/shop fixture.
    variant = await seedVariant(db.prisma, shop.taxClassId);
  });

  it("releases an expired reservation exactly once under repeated calls (idempotent, no double-release)", async () => {
    const order = await seedPendingOrder(db.prisma, shop, variant, {
      reservationExpiresAt: new Date(Date.now() - 60_000),
    });

    const first = await reservationExpiry.releaseExpiredReservations();
    const second = await reservationExpiry.releaseExpiredReservations();

    expect(first).toEqual({ releasedReservations: 1, canceledOrders: 1 });
    expect(second).toEqual({ releasedReservations: 0, canceledOrders: 0 });

    const inventory = await db.prisma.inventoryItem.findUniqueOrThrow({
      where: { id: order.inventoryItemId },
    });
    expect(inventory.reserved).toBe(0); // decremented once, not twice

    const reservation = await db.prisma.stockReservation.findUniqueOrThrow({
      where: { id: order.stockReservationId! },
    });
    expect(reservation.status).toBe(StockReservationStatus.EXPIRED);

    const orderRow = await db.prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(orderRow.status).toBe(OrderStatus.CANCELED);
  });

  it("processes the same webhook event ID exactly once (idempotent replay, real P2002 shape)", async () => {
    const order = await seedPendingOrder(db.prisma, shop, variant, {
      reservationExpiresAt: new Date(Date.now() + 15 * 60_000), // not expired
    });
    const event = succeededEvent(order.providerPaymentIntentId, `evt_replay_${order.orderId}`);

    await webhook.handle(event);
    await webhook.handle(event); // real duplicate delivery — must no-op, not throw

    const payment = await db.prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId } });
    expect(payment.status).toBe(PaymentStatus.PAID);

    const attempts = await db.prisma.paymentAttempt.count({
      where: { paymentId: order.paymentId },
    });
    expect(attempts).toBe(1); // not 2

    const movements = await db.prisma.inventoryMovement.count({
      where: { relatedOrderItemId: order.orderItemId },
    });
    expect(movements).toBe(1); // not 2

    const inventory = await db.prisma.inventoryItem.findUniqueOrThrow({
      where: { id: order.inventoryItemId },
    });
    expect(inventory.onHand).toBe(99); // decremented exactly once
  });

  it("sweep-then-late-webhook: order ends on PAYMENT_SUCCEEDED_STOCK_LOST, not stuck CANCELED under a PAID payment", async () => {
    const order = await seedPendingOrder(db.prisma, shop, variant, {
      reservationExpiresAt: new Date(Date.now() - 60_000),
    });

    // The sweep wins the race first — exactly the scenario reproduced live
    // against a real database in this checkpoint.
    await reservationExpiry.releaseExpiredReservations();
    const canceledOrder = await db.prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(canceledOrder.status).toBe(OrderStatus.CANCELED);

    // The customer's payment succeeds anyway, and the real webhook arrives late.
    await webhook.handle(
      succeededEvent(order.providerPaymentIntentId, `evt_stocklost_${order.orderId}`),
    );

    const finalOrder = await db.prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(finalOrder.status).toBe(OrderStatus.PAYMENT_SUCCEEDED_STOCK_LOST);
    expect(finalOrder.canceledAt).toBeNull(); // cleared — the order didn't actually end up canceled

    const payment = await db.prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId } });
    expect(payment.status).toBe(PaymentStatus.PAID);

    const reservation = await db.prisma.stockReservation.findUniqueOrThrow({
      where: { id: order.stockReservationId! },
    });
    expect(reservation.status).toBe(StockReservationStatus.EXPIRED); // never CONSUMED

    const movements = await db.prisma.inventoryMovement.count({
      where: { relatedOrderItemId: order.orderItemId },
    });
    expect(movements).toBe(0); // never oversell

    const inventory = await db.prisma.inventoryItem.findUniqueOrThrow({
      where: { id: order.inventoryItemId },
    });
    expect(inventory.onHand).toBe(100); // untouched
  });

  it("genuinely concurrent sweep and success webhook (Promise.all, real transactions) reach the same consistent outcome with no double side effect, regardless of which wins", async () => {
    const order = await seedPendingOrder(db.prisma, shop, variant, {
      reservationExpiresAt: new Date(Date.now() - 60_000),
    });

    // Both real code paths fired at once against the real database — which
    // one's transaction commits first is genuinely up to Postgres, not
    // controlled by this test (the point of the test).
    await Promise.all([
      reservationExpiry.releaseExpiredReservations(),
      webhook.handle(
        succeededEvent(order.providerPaymentIntentId, `evt_concurrent_${order.orderId}`),
      ),
    ]);

    const finalOrder = await db.prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    // Whichever side won, the end state must be the same: payment succeeded
    // and stock was lost, so it's always PAYMENT_SUCCEEDED_STOCK_LOST — never
    // left CANCELED (if the sweep's cancel committed after the webhook's own
    // guard already ran) and never wrongly CONFIRMED (overselling stock that
    // was actually released).
    expect(finalOrder.status).toBe(OrderStatus.PAYMENT_SUCCEEDED_STOCK_LOST);

    const payment = await db.prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId } });
    expect(payment.status).toBe(PaymentStatus.PAID);

    const attempts = await db.prisma.paymentAttempt.count({
      where: { paymentId: order.paymentId },
    });
    expect(attempts).toBe(1);

    const movements = await db.prisma.inventoryMovement.count({
      where: { relatedOrderItemId: order.orderItemId },
    });
    expect(movements).toBe(0);

    const inventory = await db.prisma.inventoryItem.findUniqueOrThrow({
      where: { id: order.inventoryItemId },
    });
    expect(inventory.onHand).toBe(100);
    expect(inventory.reserved).toBe(0);
  });

  // DECISIONS.md ADR-030: a made-to-order order has no StockReservation at
  // all (excluded from lockOrderReservationsForUpdate's query by
  // construction), so confirming it must come from OrderItem.madeToOrder
  // directly, not from the reservations result.
  it("lands a made-to-order order on IN_PRODUCTION (not CONFIRMED) with no inventory writes at all", async () => {
    const madeToOrderVariant = await seedVariant(db.prisma, shop.taxClassId, {
      tracksStock: false,
      productionTimeDays: 14,
    });
    const order = await seedPendingOrder(db.prisma, shop, madeToOrderVariant, {
      madeToOrder: { productionTimeDaysSnapshot: 14 },
    });
    expect(order.stockReservationId).toBeNull();

    await webhook.handle(
      succeededEvent(order.providerPaymentIntentId, `evt_production_${order.orderId}`),
    );

    const finalOrder = await db.prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(finalOrder.status).toBe(OrderStatus.IN_PRODUCTION);

    const payment = await db.prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId } });
    expect(payment.status).toBe(PaymentStatus.PAID);

    const orderItem = await db.prisma.orderItem.findUniqueOrThrow({
      where: { id: order.orderItemId },
    });
    expect(orderItem.madeToOrder).toBe(true);
    expect(orderItem.productionTimeDaysSnapshot).toBe(14);

    const movements = await db.prisma.inventoryMovement.count({
      where: { relatedOrderItemId: order.orderItemId },
    });
    expect(movements).toBe(0);

    const inventory = await db.prisma.inventoryItem.findUniqueOrThrow({
      where: { id: madeToOrderVariant.inventoryItemId },
    });
    expect(inventory.onHand).toBe(100); // untouched — nothing was ever reserved
    expect(inventory.reserved).toBe(0);
  });

  it("confirms a ready-to-ship-only order onto CONFIRMED, not IN_PRODUCTION (regression)", async () => {
    const order = await seedPendingOrder(db.prisma, shop, variant, {
      reservationExpiresAt: new Date(Date.now() + 15 * 60_000),
    });

    await webhook.handle(
      succeededEvent(order.providerPaymentIntentId, `evt_regression_${order.orderId}`),
    );

    const finalOrder = await db.prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(finalOrder.status).toBe(OrderStatus.CONFIRMED);
  });

  // Abandoned-checkout handling for orders no StockReservation ever covers:
  // a fully made-to-order order (every line tracksStock: false) never gets
  // one at all (checkout.service.ts only reserves finite-stock lines), so
  // without this branch it would sit in PENDING_PAYMENT forever regardless
  // of how long ago it was placed. Real Postgres is what actually exercises
  // the `items: { every: { reservation: null } }` filter — a mocked Prisma
  // client can't verify that query shape against real relations.
  describe("abandoned checkout — orders with no reservation at all (real Postgres)", () => {
    it("cancels a made-to-order order that's sat in PENDING_PAYMENT past the reservation TTL", async () => {
      const madeToOrderVariant = await seedVariant(db.prisma, shop.taxClassId, {
        tracksStock: false,
        productionTimeDays: 21,
      });
      const order = await seedPendingOrder(db.prisma, shop, madeToOrderVariant, {
        madeToOrder: { productionTimeDaysSnapshot: 21 },
      });
      expect(order.stockReservationId).toBeNull();

      // Backdate past the TTL directly — seedPendingOrder always uses
      // createdAt: now(), and this is the one field this test needs to
      // control that the shared fixture deliberately doesn't expose.
      await db.prisma.order.update({
        where: { id: order.orderId },
        data: { createdAt: new Date(Date.now() - (RESERVATION_TTL_MINUTES + 1) * 60_000) },
      });

      const result = await reservationExpiry.releaseExpiredReservations();
      expect(result.canceledOrders).toBeGreaterThanOrEqual(1);

      const finalOrder = await db.prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(finalOrder.status).toBe(OrderStatus.CANCELED);
      expect(finalOrder.canceledAt).not.toBeNull();

      // Idempotent, same as the reservation-driven branch: a second sweep
      // finds nothing left to cancel for this order.
      const second = await reservationExpiry.releaseExpiredReservations();
      const stillCanceled = await db.prisma.order.findUniqueOrThrow({
        where: { id: order.orderId },
      });
      expect(stillCanceled.status).toBe(OrderStatus.CANCELED);
      expect(second.canceledOrders).toBe(0);
    });

    it("leaves a made-to-order order alone while still within the reservation TTL window", async () => {
      const madeToOrderVariant = await seedVariant(db.prisma, shop.taxClassId, {
        tracksStock: false,
        productionTimeDays: 21,
      });
      const order = await seedPendingOrder(db.prisma, shop, madeToOrderVariant, {
        madeToOrder: { productionTimeDaysSnapshot: 21 },
      });

      await reservationExpiry.releaseExpiredReservations();

      const finalOrder = await db.prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(finalOrder.status).toBe(OrderStatus.PENDING_PAYMENT); // untouched — not yet stale
    });

    it("never touches a mixed order (has a real reservation) via the no-reservation branch", async () => {
      // A regular, reservation-backed order that's also old enough to be
      // "stale" by createdAt alone must still only ever be canceled by the
      // reservation-driven branch (its reservation expiring), never
      // double-processed by the no-reservation branch too — `items: {
      // every: { reservation: null } }` must correctly exclude it.
      const order = await seedPendingOrder(db.prisma, shop, variant, {
        reservationExpiresAt: new Date(Date.now() + 60 * 60_000), // not expired
      });
      await db.prisma.order.update({
        where: { id: order.orderId },
        data: { createdAt: new Date(Date.now() - (RESERVATION_TTL_MINUTES + 1) * 60_000) },
      });

      await reservationExpiry.releaseExpiredReservations();

      const finalOrder = await db.prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(finalOrder.status).toBe(OrderStatus.PENDING_PAYMENT); // its own reservation isn't expired yet
      const reservation = await db.prisma.stockReservation.findUniqueOrThrow({
        where: { id: order.stockReservationId! },
      });
      expect(reservation.status).toBe(StockReservationStatus.PENDING); // untouched
    });
  });
});
