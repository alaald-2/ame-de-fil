import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@ame-de-fil/ui";
import { CartPageContent } from "../../../components/cart-page-content";
import type { AppLocale } from "../../../lib/locale";

type PageParams = { locale: AppLocale };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Cart" });
  return { title: t("title") };
}

// The actual cart state lives in CartProvider (layout.tsx) — this page just
// renders it. No server-side cart fetch here (see cart-provider.tsx).
export default async function CartPage({ params }: { params: Promise<PageParams> }) {
  const { locale } = await params;

  return (
    <Container className="py-16">
      <CartPageContent locale={locale} />
    </Container>
  );
}
