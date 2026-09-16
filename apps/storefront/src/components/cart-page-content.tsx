"use client";

import { useTranslations } from "next-intl";
import { Heading, Text, Button, Spinner } from "@ame-de-fil/ui";
import { formatMoney } from "../lib/format-money";
import type { AppLocale } from "../lib/locale";
import { Link } from "../i18n/navigation";
import { useCart } from "./cart-provider";
import { CartLineItem } from "./cart-line-item";
import { CartErrorAlert } from "./cart-error-alert";

// A spacious two-column "shopping bag" (design discussion) rather than a
// generic cart table: heading + image-led line items on the left, an
// un-boxed editorial summary on the right (lg:sticky, no Card — hairline
// rules only, DESIGN_SYSTEM.md §5). Below `lg`, this collapses to a single
// column in the same DOM order (heading -> items -> summary -> CTA), which
// is also the mobile order the design brief asks for — no order-* utility
// classes needed, source order already matches.
export function CartPageContent({ locale }: { locale: AppLocale }) {
  const t = useTranslations("Cart");
  const tShop = useTranslations("Shop");
  const { cart, isLoading } = useCart();

  if (isLoading) {
    return (
      <div>
        <Heading level={1}>{t("title")}</Heading>
        <div className="mt-16 flex justify-center">
          <Spinner label={t("title")} />
        </div>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div>
        <Heading level={1}>{t("title")}</Heading>
        <div className="flex flex-col items-center py-20 text-center sm:py-28">
          <Heading level={2}>{t("emptyTitle")}</Heading>
          <Text tone="muted" className="mt-3 max-w-sm">
            {t("empty")}
          </Text>
          <Button asChild className="mt-8">
            <Link href="/shop">{t("continueShopping")}</Link>
          </Button>
        </div>
        <CartErrorAlert />
      </div>
    );
  }

  return (
    <div>
      <Heading level={1}>{t("title")}</Heading>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_360px] lg:items-start lg:gap-16">
        <div>
          {cart.items.map((item) => (
            <CartLineItem key={item.id} item={item} locale={locale} />
          ))}
        </div>

        <aside className="lg:sticky lg:top-28">
          <div className="flex flex-col gap-3 border-t border-neutral-300 pt-6 lg:border-t-0 lg:pt-0">
            <div className="flex items-baseline justify-between">
              <Text tone="muted">{t("subtotal")}</Text>
              <Text className="tabular-nums text-neutral-900">
                {formatMoney(cart.subtotal.amountMinor, locale)}
              </Text>
            </div>
            <div className="flex items-baseline justify-between">
              <Text tone="muted">{t("shipping")}</Text>
              <Text tone="muted" size="sm">
                {t("shippingNote")}
              </Text>
            </div>
          </div>

          <div className="mt-4 flex items-baseline justify-between border-t border-neutral-300 pt-4">
            <Text className="text-neutral-900">{t("total")}</Text>
            <Heading level={3}>{formatMoney(cart.subtotal.amountMinor, locale)}</Heading>
          </div>

          <Button asChild className="mt-6 w-full">
            <Link href="/checkout">{t("proceedToCheckout")}</Link>
          </Button>

          <div className="mt-5 flex flex-col gap-1">
            <Text size="sm" tone="muted" className="text-neutral-700">
              {tShop("madeToOrder")}
            </Text>
            <Text size="sm" tone="muted">
              {t("madeToOrderBody")}
            </Text>
          </div>
        </aside>
      </div>

      <CartErrorAlert />
    </div>
  );
}
