"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Heading, Text, Button } from "@ame-de-fil/ui";
import type { ShippingMethod, CheckoutResponse } from "@ame-de-fil/types";
import { Link } from "../i18n/navigation";
import type { AppLocale } from "../lib/locale";
import { useCart } from "./cart-provider";
import { CheckoutForm } from "./checkout-form";
import { OrderConfirmation } from "./order-confirmation";

export function CheckoutPageContent({
  locale,
  shippingMethods,
}: {
  locale: AppLocale;
  shippingMethods: ShippingMethod[];
}) {
  const t = useTranslations("Checkout");
  const { cart, isLoading, refresh } = useCart();
  const [confirmedOrder, setConfirmedOrder] = useState<CheckoutResponse | null>(null);

  if (confirmedOrder) {
    return <OrderConfirmation order={confirmedOrder} locale={locale} />;
  }

  if (isLoading) {
    return null;
  }

  if (cart.items.length === 0) {
    return (
      <div>
        <Heading level={1}>{t("emptyCartTitle")}</Heading>
        <Text tone="muted" className="mt-3">
          {t("emptyCartBody")}
        </Text>
        <div className="mt-6">
          <Button asChild>
            <Link href="/shop">{t("backToShop")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <CheckoutForm
      locale={locale}
      shippingMethods={shippingMethods}
      onSuccess={(order) => {
        setConfirmedOrder(order);
        void refresh();
      }}
    />
  );
}
