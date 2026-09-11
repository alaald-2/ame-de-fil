import { useTranslations } from "next-intl";
import Link from "next/link";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, Badge, Text } from "@ame-de-fil/ui";
import { reservationStatusTone } from "../lib/inventory-status";

export interface ReservationListItem {
  id: string;
  status: "PENDING" | "CONSUMED" | "EXPIRED";
  quantity: number;
  expiresAt: string;
  createdAt: string;
  variantId: string;
  sku: string;
  productName: string;
  orderId: string;
  orderNumber: string;
}

interface ReservationsTableProps {
  reservations: ReservationListItem[];
  locale: string;
}

function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

// No row-level link (there's no reservation detail page) — only the order
// number itself links out, to GET /admin/orders/:id's existing detail page
// (ROADMAP.md's own "enough to cross-reference" framing for this endpoint).
export function ReservationsTable({ reservations, locale }: ReservationsTableProps) {
  const t = useTranslations("Inventory");

  return (
    <>
      <Table className="hidden md:table">
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t("columnProduct")}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t("columnQuantity")}</TableHeaderCell>
            <TableHeaderCell>{t("columnReservationStatus")}</TableHeaderCell>
            <TableHeaderCell>{t("columnExpires")}</TableHeaderCell>
            <TableHeaderCell>{t("columnOrder")}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {reservations.map((reservation) => (
            <TableRow key={reservation.id}>
              <TableCell className="font-medium text-neutral-900">
                {reservation.productName}
                <div className="text-xs font-normal text-neutral-600">{reservation.sku}</div>
              </TableCell>
              <TableCell numeric>{reservation.quantity}</TableCell>
              <TableCell>
                <Badge tone={reservationStatusTone(reservation.status)}>
                  {t(`reservationStatus.${reservation.status}`)}
                </Badge>
              </TableCell>
              <TableCell>{formatDateTime(reservation.expiresAt, locale)}</TableCell>
              <TableCell>
                <Link
                  href={`/orders/${reservation.orderId}`}
                  className="text-neutral-900 underline decoration-neutral-400 underline-offset-2 hover:decoration-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                >
                  {reservation.orderNumber}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y divide-neutral-200 md:hidden">
        {reservations.map((reservation) => (
          <li key={reservation.id} className="px-1 py-4">
            <div className="flex items-center justify-between gap-3">
              <Text className="truncate font-medium text-neutral-900">{reservation.productName}</Text>
              <Badge tone={reservationStatusTone(reservation.status)}>
                {t(`reservationStatus.${reservation.status}`)}
              </Badge>
            </div>
            <Text size="sm" className="mt-0.5 text-neutral-600">
              {reservation.sku}
            </Text>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <Text size="sm" className="text-neutral-600">
                  {t("columnQuantity")}
                </Text>
                <Text size="sm" className="tabular-nums">
                  {reservation.quantity}
                </Text>
              </div>
              <div>
                <Text size="sm" className="text-neutral-600">
                  {t("columnExpires")}
                </Text>
                <Text size="sm">{formatDateTime(reservation.expiresAt, locale)}</Text>
              </div>
              <div>
                <Text size="sm" className="text-neutral-600">
                  {t("columnOrder")}
                </Text>
                <Link
                  href={`/orders/${reservation.orderId}`}
                  className="text-sm text-neutral-900 underline decoration-neutral-400 underline-offset-2 hover:decoration-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                >
                  {reservation.orderNumber}
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
