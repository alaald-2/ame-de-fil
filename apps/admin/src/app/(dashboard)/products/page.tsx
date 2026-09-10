import { getTranslations } from "next-intl/server";
import { ComingSoon } from "../../../components/coming-soon";
import { requireSession } from "../../../lib/dal";

export default async function ProductsPage() {
  await requireSession();
  const t = await getTranslations("Navigation");
  return <ComingSoon title={t("products")} />;
}
