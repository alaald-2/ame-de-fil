import { getTranslations } from "next-intl/server";
import { Heading, Text } from "@ame-de-fil/ui";
import { requireSession } from "../../lib/dal";

// Dashboard metrics (revenue/orders/customers/inventory/alerts —
// PRODUCT_SPEC.md §5) are real business functionality, explicitly out of
// scope for this checkpoint. This is the page shell only.
export default async function DashboardPage() {
  await requireSession();
  const t = await getTranslations();

  return (
    <div>
      <Heading level={1}>{t("Navigation.dashboard")}</Heading>
      <Text tone="muted" className="mt-2">
        {t("Common.comingSoon")}
      </Text>
    </div>
  );
}
