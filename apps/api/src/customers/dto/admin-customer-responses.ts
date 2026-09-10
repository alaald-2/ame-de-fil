import { z } from "zod";

const moneySchema = z.object({ amountMinor: z.number().int(), currency: z.literal("SEK") });

// Never passwordHash, totpSecret, sessions, oauthAccounts, or roles/
// permissions — this is a customer profile view, not an authentication or
// RBAC surface (admin-customers.service.ts's explicit Prisma select is the
// actual enforcement; this schema documents the same boundary).
const adminCustomerListItemResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  status: z.string(),
  createdAt: z.iso.datetime(),
  lastLoginAt: z.iso.datetime().nullable(),
  orderCount: z.number().int(),
});

export const listAdminCustomersResponseSchema = z.object({
  items: z.array(adminCustomerListItemResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

const adminCustomerRecentOrderResponseSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  total: moneySchema,
  createdAt: z.iso.datetime(),
});

export const adminCustomerDetailResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  locale: z.enum(["sv-SE", "en"]),
  status: z.string(),
  emailVerifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastLoginAt: z.iso.datetime().nullable(),
  orderCount: z.number().int(),
  // Most recent orders only (admin-customers.service.ts caps this), not a
  // second paginated list — GET /admin/orders?... already exists for
  // browsing a customer's full order history in depth.
  recentOrders: z.array(adminCustomerRecentOrderResponseSchema),
});
export type AdminCustomerDetailResponse = z.infer<typeof adminCustomerDetailResponseSchema>;
