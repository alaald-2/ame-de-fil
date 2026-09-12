"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FormField, Input, Text } from "@ame-de-fil/ui";
import { formatMoney } from "../lib/format-money";
import type { AdminLocale } from "../i18n/config";

export interface VariantOption {
  variantId: string;
  articleNumber: number;
  sku: string | null;
  priceMinor: number;
  productId: string;
  productName: string;
}

interface PromotionVariantPickerProps {
  options: VariantOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  // A live "normal price -> sale price" preview per checked variant — purely
  // client-side arithmetic for display (mirrors effective-price.ts's own
  // Math.round formula), never sent to the server as a price. The server
  // always recomputes the real effective price itself
  // (promotions.service.ts / effective-price.ts) from the percentage this
  // form submits, not from anything computed here.
  percentage: number;
  locale: AdminLocale;
}

function effectivePreviewMinor(basePriceMinor: number, percentage: number): number {
  if (!Number.isFinite(percentage) || percentage <= 0) return basePriceMinor;
  return Math.round((basePriceMinor * (100 - percentage)) / 100);
}

// Grouped-by-product checkbox list — same idiom as create-product-form.tsx's
// own category/collection checkboxes, just two-level (product -> its
// variants) since a promotion applies to specific variants picked from
// across the whole catalog. No search/combobox component exists in the UI
// package (Products.detail.tsx also just uses plain checkboxes), so a
// client-side text filter over the already-fetched list is the full extent
// of "search" here — deliberately not overbuilt.
export function PromotionVariantPicker({
  options,
  selectedIds,
  onChange,
  percentage,
  locale,
}: PromotionVariantPickerProps) {
  const t = useTranslations("Promotions.variantPicker");
  const [filter, setFilter] = useState("");

  const groups = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const filtered = term
      ? options.filter(
          (o) =>
            o.productName.toLowerCase().includes(term) ||
            (o.sku?.toLowerCase().includes(term) ?? false) ||
            String(o.articleNumber).includes(term),
        )
      : options;

    const byProduct = new Map<string, { productName: string; variants: VariantOption[] }>();
    for (const option of filtered) {
      const group = byProduct.get(option.productId);
      if (group) group.variants.push(option);
      else byProduct.set(option.productId, { productName: option.productName, variants: [option] });
    }
    return [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  }, [options, filter]);

  const selectedSet = new Set(selectedIds);

  function toggle(variantId: string) {
    onChange(
      selectedSet.has(variantId)
        ? selectedIds.filter((id) => id !== variantId)
        : [...selectedIds, variantId],
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <FormField label={t("filterLabel")}>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("filterPlaceholder")}
          />
        )}
      </FormField>

      <Text size="sm" tone="muted">
        {t("selectedCount", { count: selectedIds.length })}
      </Text>

      <div className="flex max-h-96 flex-col gap-4 overflow-y-auto rounded-sm border border-neutral-200 p-4">
        {groups.length === 0 ? (
          <Text size="sm" tone="muted">
            {t("noMatches")}
          </Text>
        ) : (
          groups.map((group) => (
            <fieldset key={group.productName} className="flex flex-col gap-1.5">
              <legend className="font-sans text-sm font-medium text-neutral-800">
                {group.productName}
              </legend>
              {group.variants.map((variant) => {
                const checked = selectedSet.has(variant.variantId);
                const preview = effectivePreviewMinor(variant.priceMinor, percentage);
                return (
                  <label
                    key={variant.variantId}
                    className="flex items-center justify-between gap-3 text-sm text-neutral-800"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                        checked={checked}
                        onChange={() => toggle(variant.variantId)}
                      />
                      {variant.articleNumber}
                      {variant.sku ? <span className="text-neutral-600"> · {variant.sku}</span> : null}
                    </span>
                    <span className="tabular-nums text-neutral-600">
                      {checked && percentage > 0 ? (
                        <>
                          {formatMoney(variant.priceMinor, locale)} &rarr;{" "}
                          <span className="font-medium text-neutral-900">
                            {formatMoney(preview, locale)}
                          </span>
                        </>
                      ) : (
                        formatMoney(variant.priceMinor, locale)
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))
        )}
      </div>
    </div>
  );
}
