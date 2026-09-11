import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  TableRowLink,
  Badge,
  Text,
} from "@ame-de-fil/ui";
import { orderStatusTone, paymentStatusTone } from "../lib/order-status";
import { formatMoney } from "../lib/format-money";
import type { AdminLocale } from "../i18n/config";

export interface OrderListItem {
  orderId: string;
  orderNumber: string;
  status: string;
  customer: { userId: string | null; email: string; name: string | null };
  total: { amountMinor: number; currency: "SEK" };
  paymentStatus: string | null;
  createdAt: string;
}

interface OrdersTableProps {
  orders: OrderListItem[];
  locale: AdminLocale;
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

function CustomerCell({ customer, guestLabel }: { customer: OrderListItem["customer"]; guestLabel: string }) {
  if (customer.name) {
    return (
      <>
        <div className="font-medium text-neutral-900">{customer.name}</div>
        <div className="text-xs text-neutral-600">{customer.email}</div>
      </>
    );
  }
  return (
    <>
      <div className="font-medium text-neutral-900">{customer.email}</div>
      {!customer.userId ? <div className="text-xs text-neutral-600">{guestLabel}</div> : null}
    </>
  );
}

// Same "whole row/record is a link, two markups toggled by breakpoint"
// pattern as customers-table.tsx — see that file's own comment for the
// full accessibility reasoning.
export function OrdersTable({ orders, locale }: OrdersTableProps) {
  const t = useTranslations("Orders");

  return (
    <>
      <Table className="hidden md:table">
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t("columnOrder")}</TableHeaderCell>
            <TableHeaderCell>{t("columnCustomer")}</TableHeaderCell>
            <TableHeaderCell>{t("columnStatus")}</TableHeaderCell>
            <TableHeaderCell>{t("columnPayment")}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t("columnTotal")}</TableHeaderCell>
            <TableHeaderCell>{t("columnPlaced")}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.orderId} interactive>
              <TableCell className="font-medium text-neutral-900">
                <TableRowLink href={`/orders/${order.orderId}`}>
                  {t("viewOrder", { orderNumber: order.orderNumber })}
                </TableRowLink>
                {order.orderNumber}
              </TableCell>
              <TableCell>
                <CustomerCell customer={order.customer} guestLabel={t("guestLabel")} />
              </TableCell>
              <TableCell>
                <Badge tone={orderStatusTone(order.status)}>{t(`status.${order.status}`)}</Badge>
              </TableCell>
              <TableCell>
                {order.paymentStatus ? (
                  <Badge tone={paymentStatusTone(order.paymentStatus)}>
                    {t(`paymentStatus.${order.paymentStatus}`)}
                  </Badge>
                ) : (
                  t("none")
                )}
              </TableCell>
              <TableCell numeric>{formatMoney(order.total.amountMinor, locale)}</TableCell>
              <TableCell>{formatDate(order.createdAt, locale)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y divide-neutral-200 md:hidden">
        {orders.map((order) => (
          <li key={order.orderId}>
            <Link
              href={`/orders/${order.orderId}`}
              className="block rounded-sm px-1 py-4 transition-colors hover:bg-neutral-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
            >
              <div className="flex items-center justify-between gap-3">
                {/* min-w-0 lets truncate actually shrink inside this flex
                    row instead of pushing the badge out — real order
                    numbers are a fixed short shape, but nothing here
                    should assume that and wrap/overflow if one isn't. */}
                <Text className="min-w-0 flex-1 truncate font-medium text-neutral-900">
                  {order.orderNumber}
                </Text>
                <Badge tone={orderStatusTone(order.status)}>{t(`status.${order.status}`)}</Badge>
              </div>
              <div className="mt-1">
                <CustomerCell customer={order.customer} guestLabel={t("guestLabel")} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnPayment")}
                  </Text>
                  <Text size="sm">
                    {order.paymentStatus ? t(`paymentStatus.${order.paymentStatus}`) : t("none")}
                  </Text>
                </div>
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnTotal")}
                  </Text>
                  <Text size="sm" className="tabular-nums">
                    {formatMoney(order.total.amountMinor, locale)}
                  </Text>
                </div>
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnPlaced")}
                  </Text>
                  <Text size="sm">{formatDate(order.createdAt, locale)}</Text>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
