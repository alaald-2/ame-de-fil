import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  Badge,
  Text,
} from "@ame-de-fil/ui";
import { movementTypeTone } from "../lib/inventory-status";
import { formatDateTime } from "../lib/format-date";

export interface MovementListItem {
  id: string;
  type: "SALE" | "RETURN" | "CANCELLATION" | "RESTOCK" | "ADJUSTMENT";
  quantity: number;
  reason: string | null;
  createdAt: string;
  variantId: string;
  articleNumber: number;
  sku: string | null;
  productName: string;
  createdBy: { id: string; email: string } | null;
  orderId: string | null;
  orderNumber: string | null;
}

interface MovementsTableProps {
  movements: MovementListItem[];
  locale: string;
}

// Quantity is a signed delta as InventoryMovement actually stores it
// (payments-webhook.service.ts writes SALE as negative, admin-orders.service.ts
// writes a refund's RETURN as positive) — shown with an explicit sign
// rather than normalized to always-positive, so the ledger reads as the
// real +/- history it is.
function formatSignedQuantity(quantity: number, locale: string): string {
  return new Intl.NumberFormat(locale, { signDisplay: "always" }).format(quantity);
}

// Cross-item ledger — no single detail page, so (like ReservationsTable)
// only the order number itself links out to the existing order detail page.
// `createdBy`/`orderId`/`orderNumber` are all nullable (system-driven
// movement, or a since-deleted actor/order item) and rendered as a plain
// dash rather than erroring or hiding the row.
export function MovementsTable({ movements, locale }: MovementsTableProps) {
  const t = useTranslations("Inventory");

  return (
    <>
      <Table className="hidden md:table">
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t("columnProduct")}</TableHeaderCell>
            <TableHeaderCell>{t("columnMovementType")}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t("columnQuantity")}</TableHeaderCell>
            <TableHeaderCell>{t("columnOrder")}</TableHeaderCell>
            <TableHeaderCell>{t("columnBy")}</TableHeaderCell>
            <TableHeaderCell>{t("columnDate")}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {movements.map((movement) => (
            <TableRow key={movement.id}>
              <TableCell className="font-medium text-neutral-900">
                {movement.productName}
                <div className="text-xs font-normal text-neutral-600">
                  {movement.articleNumber}
                  {movement.sku ? ` · ${movement.sku}` : ""}
                </div>
              </TableCell>
              <TableCell>
                <Badge tone={movementTypeTone(movement.type)}>
                  {t(`movementType.${movement.type}`)}
                </Badge>
                {movement.reason ? (
                  <div className="mt-0.5 text-xs text-neutral-600">{movement.reason}</div>
                ) : null}
              </TableCell>
              <TableCell numeric>{formatSignedQuantity(movement.quantity, locale)}</TableCell>
              <TableCell>
                {movement.orderId && movement.orderNumber ? (
                  <Link
                    href={`/orders/${movement.orderId}`}
                    className="text-neutral-900 underline decoration-neutral-400 underline-offset-2 hover:decoration-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  >
                    {movement.orderNumber}
                  </Link>
                ) : (
                  t("none")
                )}
              </TableCell>
              <TableCell>{movement.createdBy?.email ?? t("systemActor")}</TableCell>
              <TableCell>{formatDateTime(movement.createdAt, locale)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y divide-neutral-200 md:hidden">
        {movements.map((movement) => (
          <li key={movement.id} className="px-1 py-4">
            <div className="flex items-center justify-between gap-3">
              <Text className="truncate font-medium text-neutral-900">{movement.productName}</Text>
              <Badge tone={movementTypeTone(movement.type)}>
                {t(`movementType.${movement.type}`)}
              </Badge>
            </div>
            <Text size="sm" tone="muted" className="mt-0.5">
              {movement.articleNumber}
              {movement.sku ? ` · ${movement.sku}` : ""}
            </Text>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <Text size="sm" tone="muted">
                  {t("columnQuantity")}
                </Text>
                <Text size="sm" className="tabular-nums">
                  {formatSignedQuantity(movement.quantity, locale)}
                </Text>
              </div>
              <div>
                <Text size="sm" tone="muted">
                  {t("columnOrder")}
                </Text>
                {movement.orderId && movement.orderNumber ? (
                  <Link
                    href={`/orders/${movement.orderId}`}
                    className="block text-sm text-neutral-900 underline decoration-neutral-400 underline-offset-2 hover:decoration-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  >
                    {movement.orderNumber}
                  </Link>
                ) : (
                  <Text size="sm">{t("none")}</Text>
                )}
              </div>
              <div>
                <Text size="sm" tone="muted">
                  {t("columnDate")}
                </Text>
                <Text size="sm">{formatDateTime(movement.createdAt, locale)}</Text>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
