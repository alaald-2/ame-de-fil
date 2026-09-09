"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Heading, Text, Button } from "@ame-de-fil/ui";
import type { ShippingMethod, CheckoutResponse } from "@ame-de-fil/types";
import { Link } from "../i18n/navigation";
import type { AppLocale } from "../lib/locale";
import { useCart } from "./cart-provider";
import { CheckoutForm } from "./checkout-form";
import { PaymentStep } from "./payment-step";
import { OrderStatusPoller } from "./order-status-poller";

type Phase =
  | { kind: "form" }
  | { kind: "payment"; order: CheckoutResponse }
  | { kind: "polling"; order: CheckoutResponse };

export function CheckoutPageContent({
  locale,
  shippingMethods,
}: {
  locale: AppLocale;
  shippingMethods: ShippingMethod[];
}) {
  const t = useTranslations("Checkout");
  const { cart, isLoading, refresh } = useCart();
  const [phase, setPhase] = useState<Phase>({ kind: "form" });

  if (phase.kind === "payment") {
    // clientSecret is only ever absent on this branch if the checkout
    // response changed shape after this phase was entered, which can't
    // happen — the transition into "payment" itself is gated on its
    // presence below.
    return (
      <PaymentStep
        clientSecret={phase.order.payment.clientSecret ?? ""}
        amountMinor={phase.order.total.amountMinor}
        locale={locale}
        returnUrl={`${window.location.origin}/${locale}/checkout/complete?orderId=${phase.order.orderId}`}
        onConfirmationSubmitted={() => setPhase({ kind: "polling", order: phase.order })}
      />
    );
  }

  if (phase.kind === "polling") {
    return <OrderStatusPoller order={phase.order} locale={locale} />;
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
        void refresh();
        if (order.payment.clientSecret) {
          setPhase({ kind: "payment", order });
        } else {
          // No processor configured in this environment
          // (PendingPaymentProvider — payment-provider.ts) — there is
          // nothing to confirm client-side. Go straight to polling, which
          // honestly reflects that the order stays PENDING_PAYMENT rather
          // than claiming a false confirmation (requirement 7).
          setPhase({ kind: "polling", order });
        }
      }}
    />
  );
}
