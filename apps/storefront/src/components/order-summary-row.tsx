import { useTranslations } from "next-intl";
import { Text, Badge } from "@ame-de-fil/ui";
import type { ListMyOrdersResponse } from "@ame-de-fil/types";
import { Link } from "../i18n/navigation";
import { formatMoney } from "../lib/format-money";
import type { AppLocale } from "../lib/locale";
import { orderStatusLabelKey, orderStatusTone } from "../lib/order-status-label";

type MyOrderListItem = ListMyOrdersResponse["items"][number];

// The one "order number / date / status / total" row — shared by the
// /account "recent orders" preview and the full /account/orders list
// (design discussion, docs/plans/customer-order-history) rather than two
// near-identical layouts. The whole row is a real <a> (via next-intl's
// Link), not an absolutely-positioned overlay like Table's TableRowLink —
// that hack exists specifically to keep <table> row semantics intact; a
// plain flex row outside a table has no such constraint, so wrapping it
// directly is simpler and equally accessible.
export function OrderSummaryRow({ order, locale }: { order: MyOrderListItem; locale: AppLocale }) {
  const t = useTranslations("Account.Orders");

  return (
    <Link
      href={{ pathname: "/account/orders/[orderId]", params: { orderId: order.orderId } }}
      className="flex items-center justify-between gap-4 border-b border-neutral-200 py-4 transition-colors hover:bg-neutral-100/60"
    >
      <div>
        <Text>{order.orderNumber}</Text>
        <Text size="sm" tone="muted" className="mt-1">
          {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(order.createdAt))}
          {" · "}
          {t("itemCount", { count: order.itemCount })}
        </Text>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <Badge tone={orderStatusTone(order.status)}>{t(`status.${orderStatusLabelKey(order.status)}`)}</Badge>
        <Text size="sm">{formatMoney(order.total.amountMinor, locale)}</Text>
      </div>
    </Link>
  );
}
