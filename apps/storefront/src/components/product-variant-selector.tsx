"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Text, cn } from "@ame-de-fil/ui";
import { AddToCartButton } from "./add-to-cart-button";
import { SalePrice } from "./sale-price";
import type { AppLocale } from "../lib/locale";

interface Variant {
  id: string;
  sku: string | null;
  articleNumber: number;
  price: { amountMinor: number };
  originalPrice: { amountMinor: number } | null;
  promotion: { percentage: number } | null;
  options: Array<{ key: string; value: string; label: string }>;
  available: boolean;
  productionTimeDays: number | null;
}

interface ProductVariantSelectorProps {
  variants: Variant[];
  locale: AppLocale;
  productName: string;
  image: { url: string; altText: string | null } | null;
}

function variantLabel(variant: Variant): string {
  return variant.options.map((o) => o.label).join(" / ") || variant.sku || `#${variant.articleNumber}`;
}

// One shared price + one Add-to-cart action for whichever variant is
// currently selected, replacing the old table-row-per-variant layout (each
// row used to carry its own price and its own button). Chips select a whole
// variant directly rather than modeling a per-option (size × color) matrix
// — this project's variants aren't guaranteed to share the same option axes
// across every product, so a flat "pick one of these" row is the one
// selector shape that degrades correctly whether a product has 2 variants
// or a dozen, without needing to know its option structure in advance.
export function ProductVariantSelector({
  variants,
  locale,
  productName,
  image,
}: ProductVariantSelectorProps) {
  const t = useTranslations("Shop");
  const firstAvailable = variants.find((v) => v.available) ?? variants[0];
  const [selectedId, setSelectedId] = useState(firstAvailable?.id);
  const selected = variants.find((v) => v.id === selectedId) ?? firstAvailable;

  if (!selected) return null;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {variants.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {variants.map((variant) => {
            const isSelected = variant.id === selected.id;
            return (
              <button
                key={variant.id}
                type="button"
                disabled={!variant.available}
                onClick={() => setSelectedId(variant.id)}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-sm border px-3 py-2 font-sans text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
                  isSelected
                    ? "border-neutral-900 bg-neutral-900 text-neutral-50"
                    : "border-neutral-300 text-neutral-900 hover:border-neutral-500",
                  !variant.available && "cursor-not-allowed opacity-40",
                )}
              >
                {variantLabel(variant)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <SalePrice
          price={selected.price}
          originalPrice={selected.originalPrice}
          promotion={selected.promotion}
          locale={locale}
          size="base"
        />
        {!selected.available ? (
          <Text size="sm" tone="muted">
            {t("soldOut")}
          </Text>
        ) : selected.productionTimeDays ? (
          <Text size="sm" tone="muted">
            {t("productionTime", { days: selected.productionTimeDays })}
          </Text>
        ) : null}
      </div>

      <div>
        <AddToCartButton
          variantId={selected.id}
          available={selected.available}
          productName={productName}
          image={image}
        />
      </div>
    </div>
  );
}
