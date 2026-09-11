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

export interface CustomerListItem {
  id: string;
  email: string;
  name: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  orderCount: number;
}

interface CustomersTableProps {
  customers: CustomerListItem[];
  locale: string;
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

// Two markups for one data set, toggled purely by CSS breakpoint (no JS,
// no duplicate fetch) — a dense table at md+ where columns have room to
// breathe, clean stacked records below it where a shrunk 6-column table
// would just force horizontal scrolling. Both use the same "whole row/record
// is a link" pattern: one real anchor per item, not a link wrapping every
// cell (bad for keyboard/screen-reader navigation) or an onClick handler on
// a non-interactive element (inaccessible, unusable without JS).
export function CustomersTable({ customers, locale }: CustomersTableProps) {
  const t = useTranslations("Customers");

  return (
    <>
      <Table className="hidden md:table">
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t("columnEmail")}</TableHeaderCell>
            <TableHeaderCell>{t("columnName")}</TableHeaderCell>
            <TableHeaderCell>{t("columnStatus")}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t("columnOrders")}</TableHeaderCell>
            <TableHeaderCell>{t("columnJoined")}</TableHeaderCell>
            <TableHeaderCell>{t("columnLastActive")}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id} interactive>
              <TableCell className="font-medium text-neutral-900">
                <TableRowLink href={`/customers/${customer.id}`}>
                  {t("viewCustomer", { email: customer.email })}
                </TableRowLink>
                {customer.email}
              </TableCell>
              <TableCell>{customer.name ?? t("nameFallback")}</TableCell>
              <TableCell>
                <Badge tone={customer.status === "ACTIVE" ? "success" : "neutral"}>
                  {customer.status === "ACTIVE" ? t("statusActive") : t("statusDisabled")}
                </Badge>
              </TableCell>
              <TableCell numeric>{customer.orderCount}</TableCell>
              <TableCell>{formatDate(customer.createdAt, locale)}</TableCell>
              <TableCell>
                {customer.lastLoginAt ? formatDate(customer.lastLoginAt, locale) : t("never")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y divide-neutral-200 md:hidden">
        {customers.map((customer) => (
          <li key={customer.id}>
            <Link
              href={`/customers/${customer.id}`}
              className="block rounded-sm px-1 py-4 transition-colors hover:bg-neutral-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
            >
              <div className="flex items-center justify-between gap-3">
                <Text className="truncate font-medium text-neutral-900">{customer.email}</Text>
                <Badge tone={customer.status === "ACTIVE" ? "success" : "neutral"}>
                  {customer.status === "ACTIVE" ? t("statusActive") : t("statusDisabled")}
                </Badge>
              </div>
              <Text size="sm" tone="muted" className="mt-0.5">
                {customer.name ?? t("nameFallback")}
              </Text>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnOrders")}
                  </Text>
                  <Text size="sm" className="tabular-nums">
                    {customer.orderCount}
                  </Text>
                </div>
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnJoined")}
                  </Text>
                  <Text size="sm">{formatDate(customer.createdAt, locale)}</Text>
                </div>
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnLastActive")}
                  </Text>
                  <Text size="sm">
                    {customer.lastLoginAt ? formatDate(customer.lastLoginAt, locale) : t("never")}
                  </Text>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
