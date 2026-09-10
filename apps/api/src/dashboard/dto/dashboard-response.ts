import { z } from "zod";

const statusCountSchema = z.object({ status: z.string(), count: z.number().int() });
const refundStatusCountSchema = z.object({
  status: z.string(),
  count: z.number().int(),
  amountMinor: z.number().int(),
});

// Cross-domain aggregates only (ROADMAP.md Phase 5) — never an individual order/
// payment/refund/customer record, never a low-stock item's own name, never
// anything from Session/AuditLog. Gated by its own `dashboard.view`
// permission (SECURITY.md §2), not any of the underlying domains' `*.view`
// permissions.
export const dashboardOverviewResponseSchema = z.object({
  period: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }),

  revenue: z.object({
    grossMinor: z.number().int(),
    refundsMinor: z.number().int(),
    netMinor: z.number().int(),
    currency: z.literal("SEK"),
    confirmedOrderCount: z.number().int(),
    averageOrderValueMinor: z.number().int().nullable(),
  }),

  orders: z.object({
    totalInPeriod: z.number().int(),
    byStatus: z.array(statusCountSchema),
  }),

  payments: z.object({
    totalInPeriod: z.number().int(),
    byStatus: z.array(statusCountSchema),
  }),

  refunds: z.object({
    totalInPeriod: z.number().int(),
    byStatus: z.array(refundStatusCountSchema),
  }),

  customers: z.object({
    totalRegistered: z.number().int(),
    newInPeriod: z.number().int(),
  }),

  inventory: z.object({
    lowStockCount: z.number().int(),
  }),

  // Current-state snapshots, deliberately NOT scoped by `period` — a
  // dispute/failed refund/low-stock item needs attention regardless of
  // when the underlying record was created (DashboardService's own
  // comments explain why period-scoping these would hide old-but-urgent
  // ones).
  alerts: z.object({
    lowStockCount: z.number().int(),
    disputedPaymentsCount: z.number().int(),
    failedRefundsCount: z.number().int(),
  }),
});
export type DashboardOverviewResponse = z.infer<typeof dashboardOverviewResponseSchema>;
