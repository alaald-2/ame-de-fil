import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@ame-de-fil/ui";
import type { AddressResponse } from "@ame-de-fil/types";
import { api } from "../../../lib/api-client";
import { getCurrentUser } from "../../../lib/dal";
import { getServerApiClient } from "../../../lib/server-api";
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
//
// Saved-address prefill (design discussion, docs/plans): getCurrentUser()
// is the same non-throwing session check the header's account icon already
// uses — a guest gets `null` and savedAddresses stays empty, so the form
// renders exactly as it always has. No checkout DTO/Order change at all;
// this only ever seeds the form's own local state (checkout-form.tsx).
export default async function CheckoutPage({ params }: { params: Promise<PageParams> }) {
  const { locale } = await params;

  const [{ data, error }, session] = await Promise.all([
    api.GET("/api/v1/shipping-methods", { params: { query: { locale } } }),
    getCurrentUser(),
  ]);
  if (error || !data) throw new Error("Failed to load shipping methods");

  let savedAddresses: AddressResponse[] = [];
  if (session) {
    const client = await getServerApiClient();
    const { data: addresses } = await client.GET("/api/v1/addresses");
    savedAddresses = addresses?.items ?? [];
  }

  return (
    <Container className="py-16">
      <CheckoutPageContent locale={locale} shippingMethods={data} savedAddresses={savedAddresses} />
    </Container>
  );
}
