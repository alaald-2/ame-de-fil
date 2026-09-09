import { getTranslations } from "next-intl/server";
import { ComingSoon } from "../../../components/coming-soon";

export default async function OrdersPage() {
  const t = await getTranslations("Navigation");
  return <ComingSoon title={t("orders")} />;
}
