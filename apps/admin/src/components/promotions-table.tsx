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
import type { AdminLocale } from "../i18n/config";

export interface AdminPromotionListItem {
  id: string;
  name: string;
  percentage: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  effective: boolean;
  variantCount: number;
  updatedAt: string;
}

interface PromotionsTableProps {
  promotions: AdminPromotionListItem[];
  locale: AdminLocale;
}

function formatDate(iso: string | null, locale: string): string {
  return iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso)) : "—";
}

// Same "whole row is a link" pattern as admin-products-table.tsx — see that
// file's own comment for the full accessibility reasoning.
export function PromotionsTable({ promotions, locale }: PromotionsTableProps) {
  const t = useTranslations("Promotions");

  return (
    <>
      <Table className="hidden md:table">
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t("columnName")}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t("columnPercentage")}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t("columnVariants")}</TableHeaderCell>
            <TableHeaderCell>{t("columnStart")}</TableHeaderCell>
            <TableHeaderCell>{t("columnEnd")}</TableHeaderCell>
            <TableHeaderCell>{t("columnStatus")}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {promotions.map((promotion) => (
            <TableRow key={promotion.id} interactive>
              <TableCell className="font-medium text-neutral-900">
                <TableRowLink href={`/promotions/${promotion.id}`}>
                  {t("viewPromotion", { name: promotion.name })}
                </TableRowLink>
                {promotion.name}
              </TableCell>
              <TableCell numeric>{t("percentageValue", { percentage: promotion.percentage })}</TableCell>
              <TableCell numeric>{promotion.variantCount}</TableCell>
              <TableCell>{formatDate(promotion.startsAt, locale)}</TableCell>
              <TableCell>{formatDate(promotion.endsAt, locale)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={promotion.active ? "success" : "neutral"}>
                    {promotion.active ? t("statusActive") : t("statusInactive")}
                  </Badge>
                  {promotion.active ? (
                    <Badge tone={promotion.effective ? "success" : "neutral"}>
                      {promotion.effective ? t("statusEffective") : t("statusNotYetEffective")}
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y divide-neutral-200 md:hidden">
        {promotions.map((promotion) => (
          <li key={promotion.id}>
            <Link
              href={`/promotions/${promotion.id}`}
              className="block rounded-sm px-1 py-4 transition-colors hover:bg-neutral-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
            >
              <div className="flex items-center justify-between gap-3">
                <Text className="truncate font-medium text-neutral-900">{promotion.name}</Text>
                <Badge tone={promotion.active ? "success" : "neutral"}>
                  {promotion.active ? t("statusActive") : t("statusInactive")}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnPercentage")}
                  </Text>
                  <Text size="sm" className="tabular-nums">
                    {t("percentageValue", { percentage: promotion.percentage })}
                  </Text>
                </div>
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnVariants")}
                  </Text>
                  <Text size="sm" className="tabular-nums">
                    {promotion.variantCount}
                  </Text>
                </div>
                <div>
                  <Text size="sm" tone="muted">
                    {t("columnEnd")}
                  </Text>
                  <Text size="sm">{formatDate(promotion.endsAt, locale)}</Text>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
