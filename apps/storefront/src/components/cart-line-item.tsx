"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CartItem } from "@ame-de-fil/types";
import { Text, Input, Button } from "@ame-de-fil/ui";
import { formatMoney } from "../lib/format-money";
import type { AppLocale } from "../lib/locale";
import { useCart } from "./cart-provider";
import { SalePrice } from "./sale-price";

export function CartLineItem({ item, locale }: { item: CartItem; locale: AppLocale }) {
  const t = useTranslations("Cart");
  const tShop = useTranslations("Shop");
  const { updateQuantity, removeItem } = useCart();
  const [pending, setPending] = useState(false);

  async function handleQuantityChange(value: string) {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 1) return;
    setPending(true);
    await updateQuantity(item.id, quantity);
    setPending(false);
  }

  async function handleRemove() {
    setPending(true);
    await removeItem(item.id);
    setPending(false);
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-200 py-4">
      <div>
        <Text>{item.productName}</Text>
        <SalePrice
          price={item.unitPrice}
          originalPrice={item.originalUnitPrice}
          promotion={item.promotion}
          locale={locale}
        />
        {!item.available ? (
          <Text size="sm" tone="muted">
            {tShop("soldOut")}
          </Text>
        ) : item.availableQuantity !== null && item.quantity > item.availableQuantity ? (
          <Text size="sm" tone="muted">
            {t("onlyAvailable", { count: item.availableQuantity })}
          </Text>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <label className="sr-only" htmlFor={`quantity-${item.id}`}>
          {t("quantity")}
        </label>
        <Input
          id={`quantity-${item.id}`}
          type="number"
          min={1}
          max={99}
          defaultValue={item.quantity}
          disabled={pending}
          onBlur={(e) => handleQuantityChange(e.target.value)}
          className="w-16 text-center"
        />
        <Text className="w-24 text-right">{formatMoney(item.lineTotal.amountMinor, locale)}</Text>
        <Button type="button" variant="ghost" onClick={handleRemove} disabled={pending}>
          {t("remove")}
        </Button>
      </div>
    </div>
  );
}
