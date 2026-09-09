import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@ame-de-fil/ui";
import { api } from "../../../lib/api-client";
import { CheckoutPageContent } from "../../../components/checkout-page-content";
import type { AppLocale } from "../../../lib/locale";

type PageParams = { locale: AppLocale };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Checkout" });
  return { title: t("title") };
}

// Shipping methods are public data, fetched here on the server (same
// pattern as the shop/collections pages) — the checkout form only needs
// cart state client-side (already in CartProvider), so it never needs its
// own "fetch the shipping list on mount" effect.
export default async function CheckoutPage({ params }: { params: Promise<PageParams> }) {
  const { locale } = await params;

  const { data, error } = await api.GET("/api/v1/shipping-methods", {
    params: { query: { locale } },
  });
  if (error || !data) throw new Error("Failed to load shipping methods");

  return (
    <Container className="py-16">
      <CheckoutPageContent locale={locale} shippingMethods={data} />
    </Container>
  );
}
