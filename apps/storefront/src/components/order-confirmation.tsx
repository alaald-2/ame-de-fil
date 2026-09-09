"use client";

import { useTranslations } from "next-intl";
import { Heading, Text, Button, Alert } from "@ame-de-fil/ui";
import type { CheckoutResponse } from "@ame-de-fil/types";
import { Link } from "../i18n/navigation";
import { formatMoney } from "../lib/format-money";
import type { AppLocale } from "../lib/locale";

export function OrderConfirmation({
  order,
  locale,
}: {
  order: CheckoutResponse;
  locale: AppLocale;
}) {
  const t = useTranslations("Checkout");

  return (
    <div className="mx-auto max-w-xl">
      <Heading level={1}>{t("orderConfirmedTitle")}</Heading>
      <Text tone="muted" className="mt-2">
        {t("orderNumber")}: {order.orderNumber}
      </Text>

      <div className="mt-6 flex flex-col gap-2">
        {order.items.map((item) => (
          <div
            key={item.id}
            className="flex justify-between gap-4 border-b border-neutral-200 pb-2"
          >
            <div>
              <Text size="sm">{item.productName}</Text>
              {item.variantLabel ? (
                <Text size="sm" tone="muted">
                  {item.variantLabel} × {item.quantity}
                </Text>
              ) : null}
            </div>
            <Text size="sm">{formatMoney(item.lineTotal.amountMinor, locale)}</Text>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <div className="flex justify-between">
          <Text size="sm" tone="muted">
            {t("subtotal")}
          </Text>
          <Text size="sm">{formatMoney(order.subtotal.amountMinor, locale)}</Text>
        </div>
        <div className="flex justify-between">
          <Text size="sm" tone="muted">
            {t("shipping")} ({order.shippingMethod.name})
          </Text>
          <Text size="sm">{formatMoney(order.shipping.amountMinor, locale)}</Text>
        </div>
        <div className="flex justify-between">
          <Text size="sm" tone="muted">
            {t("tax")}
          </Text>
          <Text size="sm">{formatMoney(order.tax.amountMinor, locale)}</Text>
        </div>
        <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2">
          <Text>{t("total")}</Text>
          <Text>{formatMoney(order.total.amountMinor, locale)}</Text>
        </div>
      </div>

      {order.reservationExpiresAt ? (
        <Alert tone="info" className="mt-6">
          {t("reservationNotice", {
            time: new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(
              new Date(order.reservationExpiresAt),
            ),
          })}
        </Alert>
      ) : null}

      <div className="mt-8">
        <Button asChild>
          <Link href="/shop">{t("backToShopAfterOrder")}</Link>
        </Button>
      </div>
    </div>
  );
}
