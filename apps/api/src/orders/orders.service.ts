import { Injectable, NotFoundException } from "@nestjs/common";
import { PaymentStatus } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { hashOrderStatusToken } from "../common/order-status-token.ts";
import type { AuthContext } from "../common/types/auth-context.ts";
import type { OrderStatusResponse } from "./dto/order-status-response.ts";
import {
  MY_ORDER_DETAIL_SELECT,
  MY_ORDER_LIST_SELECT,
  mapMyOrderDetail,
  mapMyOrderListItem,
} from "./mappers/my-order.mapper.ts";
import type { ListMyOrdersResponse, MyOrderDetailResponse } from "./dto/my-order-responses.ts";

const NOT_FOUND = () =>
  new NotFoundException({ error: "OrderNotFound", message: "Order not found" });

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // Scoped entirely by userId at the query level, never a permission check
  // — "my own orders" is not an admin privilege (AdminOrdersService.listOrders's
  // own equivalent). Same pagination shape/select-then-map structure as that
  // method, deliberately not shared with it (customer/admin responses diverge
  // enough — see my-order.mapper.ts's own comment — that a shared helper
  // would need to branch on caller type internally, which is worse).
  async listMyOrders(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<ListMyOrdersResponse> {
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        select: MY_ORDER_LIST_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);

    return { items: rows.map(mapMyOrderListItem), page, pageSize, total };
  }

  // Ownership is checked here, not in the query's `where` — a mismatch and
  // a nonexistent order both throw the identical NOT_FOUND(), the same
  // enumeration-safe posture getStatus() below already uses (never confirm
  // to the caller that an orderId belonging to someone else actually exists).
  async getMyOrderDetail(userId: string, orderId: string): Promise<MyOrderDetailResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true, ...MY_ORDER_DETAIL_SELECT },
    });
    if (!order || order.userId !== userId) throw NOT_FOUND();

    return mapMyOrderDetail(order);
  }

  // Two authorization paths, deliberately not merged (DECISIONS.md
  // ADR-024): an authenticated caller is authorized purely by
  // Order.userId ownership — the guest token is never consulted for them.
  // An unauthenticated caller is authorized purely by presenting a valid,
  // unexpired, order-scoped OrderStatusToken. Either a wrong/expired/
  // mismatched token or a real ownership mismatch returns an identical 404
  // — never a 401/403 — so this endpoint can't be used to enumerate which
  // order IDs exist.
  async getStatus(
    orderId: string,
    guestToken: string | undefined,
    auth: AuthContext | undefined,
  ): Promise<OrderStatusResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        userId: true,
        status: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
    });
    if (!order) throw NOT_FOUND();

    const authorized = auth
      ? order.userId === auth.userId
      : await this.isValidGuestToken(orderId, guestToken);
    if (!authorized) throw NOT_FOUND();

    return {
      status: order.status,
      payment: { status: order.payments[0]?.status ?? PaymentStatus.PENDING },
    };
  }

  private async isValidGuestToken(orderId: string, token: string | undefined): Promise<boolean> {
    if (!token) return false;

    const record = await this.prisma.orderStatusToken.findUnique({
      where: { tokenHash: hashOrderStatusToken(token) },
      select: { orderId: true, expiresAt: true },
    });
    if (!record) return false;
    if (record.orderId !== orderId) return false;
    if (record.expiresAt.getTime() <= Date.now()) return false;
    return true;
  }
}
