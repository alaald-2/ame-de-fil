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
import { productStatusTone } from "../lib/product-status";
import { formatMoney } from "../lib/format-money";
import type { AdminLocale } from "../i18n/config";

export interface AdminProductListItem {
  id: string;
  status: string;
  name: string;
  variantCount: number;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
  updatedAt: string;
}

interface AdminProductsTableProps {
  products: AdminProductListItem[];
  locale: AdminLocale;
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

function PriceCell({ item, locale, none }: { item: AdminProductListItem; locale: AdminLocale; none: string }) {
  if (item.minPriceMinor === null || item.maxPriceMinor === null) return <>{none}</>;
  if (item.minPriceMinor === item.maxPriceMinor) return <>{formatMoney(item.minPriceMinor, locale)}</>;
  return (
    <>
      {formatMoney(item.minPriceMinor, locale)}–{formatMoney(item.maxPriceMinor, locale)}
    </>
  );
}

// Same "whole row is a link" pattern as every other admin list — see
// orders-table.tsx's own comment for the full accessibility reasoning.
export function AdminProductsTable({ products, locale }: AdminProductsTableProps) {
  const t = useTranslations("Products");

  return (
    <>
      <Table className="hidden md:table">
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t("columnProduct")}</TableHeaderCell>
            <TableHeaderCell>{t("columnStatus")}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t("columnVariants")}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t("columnPrice")}</TableHeaderCell>
            <TableHeaderCell>{t("columnUpdated")}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id} interactive>
              <TableCell className="font-medium text-neutral-900">
                <TableRowLink href={`/products/${product.id}`}>
                  {t("viewProduct", { name: product.name })}
                </TableRowLink>
                {product.name}
              </TableCell>
              <TableCell>
                <Badge tone={productStatusTone(product.status)}>{t(`status.${product.status}`)}</Badge>
              </TableCell>
              <TableCell numeric>{product.variantCount}</TableCell>
              <TableCell numeric>
                <PriceCell item={product} locale={locale} none={t("none")} />
              </TableCell>
              <TableCell>{formatDate(product.updatedAt, locale)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y divide-neutral-200 md:hidden">
        {products.map((product) => (
          <li key={product.id}>
            <Link
              href={`/products/${product.id}`}
              className="block rounded-sm px-1 py-4 transition-colors hover:bg-neutral-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
            >
              <div className="flex items-center justify-between gap-3">
                <Text className="truncate font-medium text-neutral-900">{product.name}</Text>
                <Badge tone={productStatusTone(product.status)}>{t(`status.${product.status}`)}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnVariants")}
                  </Text>
                  <Text size="sm" className="tabular-nums">
                    {product.variantCount}
                  </Text>
                </div>
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnPrice")}
                  </Text>
                  <Text size="sm" className="tabular-nums">
                    <PriceCell item={product} locale={locale} none={t("none")} />
                  </Text>
                </div>
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnUpdated")}
                  </Text>
                  <Text size="sm">{formatDate(product.updatedAt, locale)}</Text>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
