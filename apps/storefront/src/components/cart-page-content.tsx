"use client";

import { useTranslations } from "next-intl";
import { Heading, Text, Button, Spinner } from "@ame-de-fil/ui";
import { formatMoney } from "../lib/format-money";
import type { AppLocale } from "../lib/locale";
import { Link } from "../i18n/navigation";
import { useCart } from "./cart-provider";
import { CartLineItem } from "./cart-line-item";
import { CartErrorAlert } from "./cart-error-alert";

export function CartPageContent({ locale }: { locale: AppLocale }) {
  const t = useTranslations("Cart");
  const { cart, isLoading } = useCart();

  return (
    <div>
      <Heading level={1}>{t("title")}</Heading>

      {isLoading ? (
        <div className="mt-8">
          <Spinner label={t("title")} />
        </div>
      ) : cart.items.length === 0 ? (
        <div className="mt-8">
          <Text tone="muted">{t("empty")}</Text>
          <div className="mt-6">
            <Button asChild>
              <Link href="/shop">{t("continueShopping")}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <div>
            {cart.items.map((item) => (
              <CartLineItem key={item.id} item={item} locale={locale} />
            ))}
          </div>
          <div className="mt-6 flex items-center justify-end gap-6">
            <div className="text-right">
              <Text tone="muted">{t("subtotal")}</Text>
              <Heading level={3}>{formatMoney(cart.subtotal.amountMinor, locale)}</Heading>
            </div>
            <Button asChild>
              <Link href="/checkout">{t("proceedToCheckout")}</Link>
            </Button>
          </div>
        </div>
      )}

      <CartErrorAlert />
    </div>
  );
}
