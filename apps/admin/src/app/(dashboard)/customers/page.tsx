import { getTranslations } from "next-intl/server";
import { ComingSoon } from "../../../components/coming-soon";
import { requireSession } from "../../../lib/dal";

export default async function CustomersPage() {
  await requireSession();
  const t = await getTranslations("Navigation");
  return <ComingSoon title={t("customers")} />;
}
