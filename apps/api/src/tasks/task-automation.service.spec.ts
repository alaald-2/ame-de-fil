import { describe, expect, it, vi } from "vitest";
import { OrderStatus, PaymentStatus, RefundStatus, TaskSource, TaskStatus, TaskType } from "@ame-de-fil/database";
import { TaskAutomationService } from "./task-automation.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import type { InventoryService } from "../inventory/inventory.service.ts";
import type { Env } from "@ame-de-fil/config";
import type { ConfigService } from "@nestjs/config";

const NOW = new Date("2026-09-15T12:00:00Z");

const DEFAULT_ENV: Partial<Env> = {
  TASK_DELAYED_ORDER_GRACE_DAYS: 2,
  TASK_REFUND_FOLLOWUP_DELAY_DAYS: 3,
  TASK_REFUND_PENDING_FOLLOWUP_HOURS: 24,
};

function configStub(overrides: Partial<Env> = {}) {
  const env = { ...DEFAULT_ENV, ...overrides };
  return { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>;
}

// Routes a findMany mock's `where` argument to fixture data by predicate —
// robust to runSweep's exact call order/count changing later, unlike
// chained mockResolvedValueOnce calls would be. Unmatched calls (every
// step not under test) fall through to [] so their generate/close methods
// short-circuit as no-ops.
function whereRouter(routes: { match: (where: Record<string, unknown>) => boolean; result: unknown[] }[]) {
  return vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
    const route = routes.find((r) => r.match(where));
    return Promise.resolve(route ? route.result : []);
  });
}

function baseMock() {
  return {
    order: { findMany: whereRouter([]) },
    task: { findMany: whereRouter([]), createMany: vi.fn().mockResolvedValue({ count: 0 }), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    refund: { findMany: whereRouter([]) },
    payment: { findMany: whereRouter([]) },
  };
}

function makeService(overrides: Record<string, unknown> = {}, inventoryOverrides: Partial<InventoryService> = {}, env?: Partial<Env>) {
  const prisma = { ...baseMock(), ...overrides } as unknown as PrismaService;
  const inventory = {
    listLowStock: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 1000, total: 0 }),
    ...inventoryOverrides,
  } as unknown as InventoryService;
  return { service: new TaskAutomationService(prisma, inventory, configStub(env)), prisma, inventory };
}

describe("TaskAutomationService — production checklist", () => {
  it("generates all four pre-ship tasks for an IN_PRODUCTION order, due at confirmedAt + the longest production time", async () => {
    const { service, prisma } = makeService({
      order: {
        findMany: whereRouter([
          {
            match: (w) => w["status"] === OrderStatus.IN_PRODUCTION,
            result: [
              {
                id: "order-1",
                orderNumber: "AF-1001",
                confirmedAt: new Date("2026-09-01T00:00:00Z"),
                items: [{ productionTimeDaysSnapshot: 5 }, { productionTimeDaysSnapshot: 10 }],
              },
            ],
          },
        ]),
      },
    });

    await service.runSweep(NOW);

    const createCalls = (prisma.task.createMany as ReturnType<typeof vi.fn>).mock.calls;
    const checklistCall = createCalls.find((call) =>
      (call[0].data as { dedupeKey: string }[]).some((row) => row.dedupeKey === "order:order-1:START_PRODUCTION"),
    );
    expect(checklistCall).toBeDefined();
    const rows = checklistCall![0].data as { type: string; dedupeKey: string; dueAt: Date | null }[];
    expect(rows.map((r) => r.type)).toEqual([
      TaskType.START_PRODUCTION,
      TaskType.FINISH_PRODUCTION,
      TaskType.QUALITY_CHECK,
      TaskType.PACK_ORDER,
    ]);
    const finishRow = rows.find((r) => r.type === TaskType.FINISH_PRODUCTION)!;
    expect(finishRow.dueAt).toEqual(new Date("2026-09-11T00:00:00Z")); // confirmedAt + 10 days
  });

  it("closes the four checklist tasks once the order reaches READY_TO_SHIP", async () => {
    const { service, prisma } = makeService({
      order: {
        findMany: whereRouter([
          {
            match: (w) => Array.isArray((w["status"] as { in?: string[] })?.in),
            result: [{ id: "order-1" }],
          },
        ]),
      },
    });

    await service.runSweep(NOW);

    const updateCalls = (prisma.task.updateMany as ReturnType<typeof vi.fn>).mock.calls;
    const closeCall = updateCalls.find(
      (call) => call[0].where.orderId?.in?.includes("order-1") && call[0].where.type?.in?.includes(TaskType.PACK_ORDER),
    );
    expect(closeCall).toBeDefined();
    expect(closeCall![0].data).toMatchObject({ status: TaskStatus.DONE });
  });
});

describe("TaskAutomationService — restock", () => {
  it("generates a RESTOCK task keyed by variantId, reusing InventoryService.listLowStock verbatim", async () => {
    const { service, prisma, inventory } = makeService(
      {},
      {
        listLowStock: vi.fn().mockResolvedValue({
          items: [{ variantId: "var-1", articleNumber: 100001, productName: "Halsduk", sku: null }],
          page: 1,
          pageSize: 1000,
          total: 1,
        }),
      },
    );

    await service.runSweep(NOW);

    expect(inventory.listLowStock).toHaveBeenCalled();
    const createCalls = (prisma.task.createMany as ReturnType<typeof vi.fn>).mock.calls;
    const restockCall = createCalls.find((call) =>
      (call[0].data as { dedupeKey: string }[]).some((row) => row.dedupeKey === "variant:var-1:RESTOCK"),
    );
    expect(restockCall![0].data[0]).toMatchObject({ type: TaskType.RESTOCK, source: TaskSource.AUTOMATED, productVariantId: "var-1" });
  });
});

describe("TaskAutomationService — refunds", () => {
  it("only flags a PENDING refund once it has been stuck past TASK_REFUND_PENDING_FOLLOWUP_HOURS", async () => {
    const { service, prisma } = makeService({
      refund: {
        findMany: whereRouter([
          {
            match: (w) => w["status"] === RefundStatus.PENDING && "createdAt" in w,
            result: [{ id: "refund-1", payment: { orderId: "order-1", order: { orderNumber: "AF-1001" } } }],
          },
        ]),
      },
    });

    await service.runSweep(NOW);

    const createCalls = (prisma.task.createMany as ReturnType<typeof vi.fn>).mock.calls;
    const pendingCall = createCalls.find((call) =>
      (call[0].data as { dedupeKey: string }[]).some((row) => row.dedupeKey === "refund:refund-1:FOLLOW_UP_PENDING_REFUND"),
    );
    expect(pendingCall).toBeDefined();
  });

  it("closes a pending-refund follow-up once the refund is no longer PENDING", async () => {
    const { service, prisma } = makeService({
      task: {
        findMany: whereRouter([
          { match: (w) => w["type"] === TaskType.FOLLOW_UP_PENDING_REFUND, result: [{ id: "task-1", dedupeKey: "refund:refund-1:FOLLOW_UP_PENDING_REFUND" }] },
        ]),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      refund: {
        // The "still pending?" check finds nothing — the refund already resolved.
        findMany: whereRouter([{ match: (w) => Array.isArray((w["id"] as { in?: string[] })?.in), result: [] }]),
      },
    });

    await service.runSweep(NOW);

    const updateCalls = (prisma.task.updateMany as ReturnType<typeof vi.fn>).mock.calls;
    const closeCall = updateCalls.find((call) => call[0].where.id?.in?.includes("task-1"));
    expect(closeCall![0].data).toMatchObject({ status: TaskStatus.DONE });
  });
});

describe("TaskAutomationService — disputes", () => {
  it("never fabricates a due date for a REVIEW_DISPUTE task", async () => {
    const { service, prisma } = makeService({
      payment: {
        findMany: whereRouter([
          { match: (w) => w["status"] === PaymentStatus.DISPUTED, result: [{ id: "pay-1", orderId: "order-1", order: { orderNumber: "AF-1001" } }] },
        ]),
      },
    });

    await service.runSweep(NOW);

    const createCalls = (prisma.task.createMany as ReturnType<typeof vi.fn>).mock.calls;
    const disputeCall = createCalls.find((call) =>
      (call[0].data as { dedupeKey: string }[]).some((row) => row.dedupeKey === "payment:pay-1:REVIEW_DISPUTE"),
    );
    expect(disputeCall![0].data[0].dueAt).toBeUndefined();
  });
});
