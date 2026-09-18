import { Locale, type Prisma } from "@ame-de-fil/database";
import type { TaskResponse } from "../dto/task-responses.ts";

const USER_REF_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

// The explicit select every list()/getOne() query in this module shares —
// same "select, never bare include" posture as admin-orders/admin-customers
// (never risks a User row's passwordHash/totpSecret reaching a response).
export const TASK_SELECT = {
  id: true,
  type: true,
  source: true,
  title: true,
  notes: true,
  status: true,
  dueAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: USER_REF_SELECT },
  createdBy: { select: USER_REF_SELECT },
  customer: { select: USER_REF_SELECT },
  order: { select: { id: true, orderNumber: true } },
  orderItem: { select: { id: true, productNameSnapshot: true } },
  variant: {
    select: {
      id: true,
      articleNumber: true,
      sku: true,
      product: { select: { translations: { select: { locale: true, name: true } } } },
    },
  },
} satisfies Prisma.TaskSelect;

export type TaskWithContext = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

// Same admin-facing "prefer sv-SE, fall back to whatever exists, then
// SKU/article number" resolution rule as inventory's own
// resolveVariantDisplayName — duplicated rather than imported since the two
// modules otherwise have no dependency on each other, and this is five
// lines, not a shared abstraction worth coupling them for.
function resolveVariantDisplayName(variant: {
  articleNumber: number;
  sku: string | null;
  product: { translations: { locale: Locale; name: string }[] };
}): string {
  const translations = variant.product.translations;
  const preferred = translations.find((t) => t.locale === Locale.sv_SE);
  return (preferred ?? translations[0])?.name ?? variant.sku ?? String(variant.articleNumber);
}

export function mapTask(task: TaskWithContext): TaskResponse {
  return {
    id: task.id,
    type: task.type,
    source: task.source,
    title: task.title,
    notes: task.notes,
    status: task.status,
    dueAt: task.dueAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    assignedTo: task.assignedTo,
    createdBy: task.createdBy,
    customer: task.customer,
    order: task.order,
    orderItem: task.orderItem,
    variant: task.variant
      ? {
          id: task.variant.id,
          articleNumber: task.variant.articleNumber,
          productName: resolveVariantDisplayName(task.variant),
        }
      : null,
  };
}
