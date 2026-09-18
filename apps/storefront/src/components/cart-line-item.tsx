"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CartItem } from "@ame-de-fil/types";
import { Text, PlaceholderImage, cn } from "@ame-de-fil/ui";
import { formatMoney } from "../lib/format-money";
import type { AppLocale } from "../lib/locale";
import { useCart } from "./cart-provider";
import { SalePrice } from "./sale-price";

const MAX_QUANTITY = 99;

// Plain typographic glyphs rather than icon components — a compact
// hairline-bordered stepper reads calmer/more editorial than an icon-button
// pair (DESIGN_SYSTEM.md §5's "restrained, mostly text" button guidance
// extends naturally to this control).
function QuantityStepper({
  quantity,
  disabled,
  onChange,
  decreaseLabel,
  increaseLabel,
  quantityLabel,
}: {
  quantity: number;
  disabled: boolean;
  onChange: (next: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  quantityLabel: string;
}) {
  return (
    <div className="flex items-center border border-neutral-300">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={disabled || quantity <= 1}
        aria-label={decreaseLabel}
        className="flex h-9 w-9 items-center justify-center font-sans text-base text-neutral-700 transition-colors duration-150 hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        −
      </button>
      <span
        aria-live="polite"
        aria-label={quantityLabel}
        className="w-8 text-center font-sans text-sm tabular-nums text-neutral-900"
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={disabled || quantity >= MAX_QUANTITY}
        aria-label={increaseLabel}
        className="flex h-9 w-9 items-center justify-center font-sans text-base text-neutral-700 transition-colors duration-150 hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        +
      </button>
    </div>
  );
}

// Redesigned as a spacious, image-led "shopping bag" row (design discussion)
// — still a hairline border between rows, never a Card (DESIGN_SYSTEM.md
// §5). Quantity is now a stepper, not a free-typed field: simpler than the
// old debounced-input state machine, and matches "− / quantity / +" as
// asked for; updateQuantity/removeItem themselves are entirely unchanged
// (cart-provider.tsx), so stock clamping/rejection still happens exactly
// where it always did — server-side.
export function CartLineItem({ item, locale }: { item: CartItem; locale: AppLocale }) {
  const t = useTranslations("Cart");
  const tShop = useTranslations("Shop");
  const { updateQuantity, removeItem } = useCart();
  const [pending, setPending] = useState(false);

  async function handleQuantityChange(nextQuantity: number) {
    if (nextQuantity < 1 || nextQuantity > MAX_QUANTITY) return;
    setPending(true);
    await updateQuantity(item.id, nextQuantity);
    setPending(false);
  }

  async function handleRemove() {
    setPending(true);
    await removeItem(item.id);
    setPending(false);
  }

  return (
    <div
      className={cn(
        "flex gap-5 border-b border-neutral-200 py-8 first:pt-0",
        pending && "opacity-60",
      )}
    >
      <div className="w-24 shrink-0 sm:w-28">
        <div className="relative aspect-[3/4] overflow-hidden bg-neutral-100">
          {item.image ? (
            // Plain <img>, matching product-card.tsx's own established
            // approach (next.config.ts's remotePatterns still empty —
            // DECISIONS.md ADR-020) — not a new image source, the same
            // one the catalog already uses.
            <img
              src={item.image.url}
              alt={item.image.altText ?? ""}
              className="h-full w-full object-cover"
            />
          ) : (
            <PlaceholderImage className="h-full w-full" />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <Text className="text-neutral-900">{item.productName}</Text>
          {item.variantLabel ? (
            <Text size="sm" tone="muted">
              {item.variantLabel}
            </Text>
          ) : null}
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

        <div className="flex flex-col items-start gap-3 sm:items-end sm:gap-4">
          <QuantityStepper
            quantity={item.quantity}
            disabled={pending}
            onChange={handleQuantityChange}
            decreaseLabel={t("decreaseQuantity")}
            increaseLabel={t("increaseQuantity")}
            quantityLabel={t("quantity")}
          />
          <Text className="tabular-nums text-neutral-900">
            {formatMoney(item.lineTotal.amountMinor, locale)}
          </Text>
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="font-sans text-sm text-neutral-600 underline-offset-4 transition-colors duration-150 hover:text-neutral-900 hover:underline disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            {t("remove")}
          </button>
        </div>
      </div>
    </div>
  );
}
