"use client";

import { useTranslations } from "next-intl";
import { Heading, Text } from "@ame-de-fil/ui";
import { readCheckoutOrder } from "../lib/checkout-order-storage";
import type { AppLocale } from "../lib/locale";
import { OrderStatusPoller } from "./order-status-poller";

// Landing target for a Stripe 3DS redirect (payment-step.tsx's return_url)
// — a fresh page load, so the checkout response only ever held in the
// checkout page's React state is gone; it's rehydrated from sessionStorage
// instead (checkout-order-storage.ts). If that's unavailable too (a lost
// tab/session across the redirect — a real but uncommon edge case), there
// is genuinely nothing to poll with: the order and payment are still
// correct server-side (the webhook doesn't depend on this page at all),
// only this page's visibility into it is lost.
export function CheckoutCompleteContent({
  orderId,
  locale,
}: {
  orderId: string | undefined;
  locale: AppLocale;
}) {
  const t = useTranslations("Checkout");
  const order = orderId ? readCheckoutOrder(orderId) : null;

  if (!order) {
    return (
      <div>
        <Heading level={1}>{t("stillConfirmingTitle")}</Heading>
        <Text tone="muted" className="mt-3">
          {t("stillConfirmingBody")}
        </Text>
      </div>
    );
  }

  return <OrderStatusPoller order={order} locale={locale} />;
}
