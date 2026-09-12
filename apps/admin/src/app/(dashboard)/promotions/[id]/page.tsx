import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Link, Badge, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { PromotionDetailForm } from "../../../../components/promotion-detail-form";
import type { AdminLocale } from "../../../../i18n/config";

interface PromotionDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatDate(iso: string | null, locale: string): string {
  return iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso)) : "—";
}

// Real GET /admin/promotions/:id data (promotions.view-gated server-side).
// Mirrors the Product detail page's own shape: server-rendered shell, one
// client island for the real mutation (PromotionDetailForm covers
// edit+activate/deactivate+variant reassignment in a single PATCH).
export default async function PromotionDetailPage({ params }: PromotionDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;

  const t = await getTranslations("Promotions");
  const td = await getTranslations("Promotions.detail");
  const locale = (await getLocale()) as AdminLocale;
  const client = await getServerApiClient();
  const permissions = session.user.permissions;

  const contentLocale = locale === "sv-SE" ? "sv-SE" : "en";
  const { data: promotion, error, response } = await client.GET("/api/v1/admin/promotions/{id}", {
    params: { path: { id }, query: { locale: contentLocale } },
  });

  if (error) {
    if (response.status === 404) notFound();
    return (
      <ErrorState
        className="mt-6"
        title={response.status === 403 ? t("forbiddenTitle") : td("detailErrorTitle")}
        description={response.status === 403 ? t("forbiddenDescription") : td("detailErrorDescription")}
      />
    );
  }

  const canManage = permissions.includes("promotions.manage");

  const variantOptionsResult = canManage
    ? await client.GET("/api/v1/admin/products/variants", { params: { query: { locale: contentLocale } } })
    : null;
  const variantOptions =
    variantOptionsResult && !variantOptionsResult.error ? variantOptionsResult.data : [];

  return (
    <div>
      <Link href="/promotions" className="text-sm">
        &larr; {td("backToPromotions")}
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Heading level={1}>{promotion.name}</Heading>
      </div>

      <Text tone="muted" className="mt-1">
        {td("updated")}: {formatDate(promotion.updatedAt, locale)}
      </Text>

      {canManage ? (
        <PromotionDetailForm
          promotionId={promotion.id}
          name={promotion.name}
          percentage={promotion.percentage}
          startsAt={promotion.startsAt}
          endsAt={promotion.endsAt}
          active={promotion.active}
          effective={promotion.effective}
          variantIds={promotion.variants.map((v) => v.variantId)}
          variantOptions={variantOptions}
          locale={locale}
        />
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={promotion.active ? "success" : "neutral"}>
              {promotion.active ? td("statusActive") : td("statusInactive")}
            </Badge>
            {promotion.active ? (
              <Badge tone={promotion.effective ? "success" : "neutral"}>
                {promotion.effective ? td("statusEffective") : td("statusNotYetEffective")}
              </Badge>
            ) : null}
          </div>
          <Text size="sm">{td("percentageLabel")}: {t("percentageValue", { percentage: promotion.percentage })}</Text>
          <Text size="sm" tone="muted">{td("readOnlyNotice")}</Text>
          <ul className="mt-2 flex flex-col gap-1">
            {promotion.variants.map((variant) => (
              <li key={variant.variantId}>
                <Text size="sm">
                  {variant.productName} — {variant.articleNumber}
                  {variant.sku ? ` (${variant.sku})` : ""}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
