import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import {
  ADMIN_CUSTOMER_DETAIL_SELECT,
  ADMIN_CUSTOMER_LIST_SELECT,
  mapAdminCustomerDetail,
  mapAdminCustomerListItem,
} from "./mappers/admin-customer.mapper.ts";
import type { AdminCustomerDetailResponse } from "./dto/admin-customer-responses.ts";

const CUSTOMER_NOT_FOUND = () =>
  new NotFoundException({ error: "CustomerNotFound", message: "Customer not found" });

// Read-only, permission-gated by `customers.view` at the controller — not
// ownership-checked here. `User` also holds staff/admin accounts (there is
// no separate Customer model, and no isStaff/isCustomer flag on the
// schema) — this genuinely lists every User row, admin-safe fields only,
// the same way GET /admin/orders lists every order regardless of who
// placed it. Least-fetch by construction: both queries use an explicit
// `select` (never a bare relation include), so passwordHash/totpSecret/
// sessions/oauthAccounts/roles can never reach this response regardless
// of what's added to the User model later.
@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(page: number, pageSize: number, q?: string) {
    // firstName/lastName/email/phone are all plain string columns on User
    // itself — a straight OR, no raw SQL or relation join needed (unlike
    // Products/Orders, which have to reach a numeric Article Number on a
    // related table).
    const where: Prisma.UserWhereInput = q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: ADMIN_CUSTOMER_LIST_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: rows.map(mapAdminCustomerListItem),
      page,
      pageSize,
      total,
    };
  }

  async getDetail(id: string): Promise<AdminCustomerDetailResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: ADMIN_CUSTOMER_DETAIL_SELECT,
    });
    if (!user) throw CUSTOMER_NOT_FOUND();

    return mapAdminCustomerDetail(user);
  }
}
