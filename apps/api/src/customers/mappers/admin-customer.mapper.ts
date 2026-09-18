import type { Prisma } from "@ame-de-fil/database";
import { fromPrismaLocale } from "../../common/locale.ts";

// A fixed cap, not a second paginated list — GET /admin/orders already
// exists for browsing a customer's full order history in depth; this is
// just enough for a customer-detail page to show recent activity at a
// glance (same idiom as InventoryService.getByVariantId's movement cap).
const RECENT_ORDERS_LIMIT = 10;

function joinName(firstName: string | null, lastName: string | null): string | null {
  return [firstName, lastName].filter(Boolean).join(" ") || null;
}

// Never passwordHash, totpSecret, sessions, oauthAccounts, or roles — this
// is a customer-profile view, not an authentication or RBAC surface.
export const ADMIN_CUSTOMER_LIST_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  _count: { select: { orders: true } },
} satisfies Prisma.UserSelect;

export type AdminCustomerListRow = Prisma.UserGetPayload<{
  select: typeof ADMIN_CUSTOMER_LIST_SELECT;
}>;

export function mapAdminCustomerListItem(user: AdminCustomerListRow) {
  return {
    id: user.id,
    email: user.email,
    name: joinName(user.firstName, user.lastName),
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    orderCount: user._count.orders,
  };
}

export const ADMIN_CUSTOMER_DETAIL_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  locale: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  _count: { select: { orders: true } },
  orders: {
    orderBy: { createdAt: "desc" as const },
    take: RECENT_ORDERS_LIMIT,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalMinor: true,
      currency: true,
      createdAt: true,
    },
  },
} satisfies Prisma.UserSelect;

export type AdminCustomerDetailRow = Prisma.UserGetPayload<{
  select: typeof ADMIN_CUSTOMER_DETAIL_SELECT;
}>;

export function mapAdminCustomerDetail(user: AdminCustomerDetailRow) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    locale: fromPrismaLocale(user.locale),
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    orderCount: user._count.orders,
    recentOrders: user.orders.map((order) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: { amountMinor: order.totalMinor, currency: order.currency },
      createdAt: order.createdAt.toISOString(),
    })),
  };
}
