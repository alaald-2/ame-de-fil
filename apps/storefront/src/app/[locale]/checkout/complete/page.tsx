import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container } from "@ame-de-fil/ui";
import { CheckoutCompleteContent } from "../../../../components/checkout-complete-content";
import type { AppLocale } from "../../../../lib/locale";

type PageParams = { locale: AppLocale };
type PageSearchParams = { orderId?: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Checkout" });
  return { title: t("title") };
}

// Stripe's confirmPayment return_url target (payment-step.tsx) — reached
// only when a payment method genuinely required a redirect (e.g. a 3DS
// challenge); the inline (no-redirect) path never navigates here at all.
// Deliberately carries only the non-sensitive orderId in its query string —
// never the order-status token, which is read back from sessionStorage
// client-side instead (checkout-complete-content.tsx).
export default async function CheckoutCompletePage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<PageSearchParams>;
}) {
  const { locale } = await params;
  const { orderId } = await searchParams;

  return (
    <Container className="py-16">
      <CheckoutCompleteContent orderId={orderId} locale={locale} />
    </Container>
  );
}
