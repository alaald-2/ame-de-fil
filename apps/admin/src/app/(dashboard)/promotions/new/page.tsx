import { getTranslations, getLocale } from "next-intl/server";
import { Heading, Text, Link, ErrorState } from "@ame-de-fil/ui";
import { requireSession } from "../../../../lib/dal";
import { getServerApiClient } from "../../../../lib/server-api";
import { CreatePromotionForm } from "../../../../components/create-promotion-form";
import type { AdminLocale } from "../../../../i18n/config";

export default async function NewPromotionPage() {
  const session = await requireSession();

  const t = await getTranslations("Promotions");
  const tCreate = await getTranslations("Promotions.create");
  const locale = (await getLocale()) as AdminLocale;
  const client = await getServerApiClient();

  if (!session.user.permissions.includes("promotions.manage")) {
    return (
      <div>
        <Heading level={1}>{tCreate("heading")}</Heading>
        <ErrorState
          className="mt-6"
          title={t("forbiddenTitle")}
          description={t("forbiddenDescription")}
        />
      </div>
    );
  }

  // Same sv-SE/en content-locale mapping as products/new/page.tsx — "es" is
  // purely the Admin UI's own display language, never a catalog content
  // locale.
  const contentLocale = locale === "sv-SE" ? "sv-SE" : "en";
  const variantOptionsResult = await client.GET("/api/v1/admin/products/variants", {
    params: { query: { locale: contentLocale } },
  });
  const variantOptions = variantOptionsResult.error ? [] : variantOptionsResult.data;

  return (
    <div>
      <Link href="/promotions" className="text-sm">
        &larr; {tCreate("backToPromotions")}
      </Link>
      <Heading level={1} className="mt-4">
        {tCreate("heading")}
      </Heading>
      <Text tone="muted" className="mt-2 max-w-2xl">
        {tCreate("intro")}
      </Text>
      <CreatePromotionForm variantOptions={variantOptions} locale={locale} />
    </div>
  );
}
