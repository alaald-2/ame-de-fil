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
  Text,
} from "@ame-de-fil/ui";
import type { AdminLocale } from "../i18n/config";

export interface AdminTaxonomyListItem {
  id: string;
  name: string;
  productCount: number;
  updatedAt: string;
}

interface AdminTaxonomyTableProps {
  items: AdminTaxonomyListItem[];
  locale: AdminLocale;
  detailBasePath: "/content" | "/content/collections";
  namespace: "Content.categories" | "Content.collections";
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
}

// Shared by both /content (categories) and /content/collections — Category
// and Collection are structurally identical (see admin-taxonomy.mapper.ts on
// the API side), so this is one parameterized component rather than two
// near-duplicate tables. Same "whole row is a link" pattern as every other
// admin list — see orders-table.tsx's own comment for the full
// accessibility reasoning.
export function AdminTaxonomyTable({ items, locale, detailBasePath, namespace }: AdminTaxonomyTableProps) {
  const t = useTranslations(namespace);
  const viewLabelKey = namespace === "Content.categories" ? "viewCategory" : "viewCollection";

  return (
    <>
      <Table className="hidden md:table">
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t("columnName")}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t("columnProducts")}</TableHeaderCell>
            <TableHeaderCell>{t("columnUpdated")}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} interactive>
              <TableCell className="font-medium text-neutral-900">
                <TableRowLink href={`${detailBasePath}/${item.id}`}>
                  {t(viewLabelKey, { name: item.name })}
                </TableRowLink>
                {item.name}
              </TableCell>
              <TableCell numeric>{item.productCount}</TableCell>
              <TableCell>{formatDate(item.updatedAt, locale)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y divide-neutral-200 md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`${detailBasePath}/${item.id}`}
              className="block rounded-sm px-1 py-4 transition-colors hover:bg-neutral-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
            >
              <Text className="truncate font-medium text-neutral-900">{item.name}</Text>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnProducts")}
                  </Text>
                  <Text size="sm" className="tabular-nums">
                    {item.productCount}
                  </Text>
                </div>
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnUpdated")}
                  </Text>
                  <Text size="sm">{formatDate(item.updatedAt, locale)}</Text>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
