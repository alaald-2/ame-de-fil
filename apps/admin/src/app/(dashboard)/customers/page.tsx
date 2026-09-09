import { getTranslations } from "next-intl/server";
import { ComingSoon } from "../../../components/coming-soon";

export default async function CustomersPage() {
  const t = await getTranslations("Navigation");
  return <ComingSoon title={t("customers")} />;
}
