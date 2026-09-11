"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Heading, Text, Button, Alert, Card, Spinner } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

export interface ProductVariantData {
  id: string;
  sku: string;
  priceMinor: number;
  taxClassCode: string;
  weightGrams: number | null;
  isActive: boolean;
  selectedOptionValues: Record<string, string>;
  inventory: {
    onHand: number;
    reserved: number;
    tracksStock: boolean;
    isLimitedEdition: boolean;
    productionTimeDays: number | null;
  } | null;
}

interface VariantDraft {
  price: string;
  taxClassCode: string;
  weightGrams: string;
  isActive: boolean;
  isLimitedEdition: boolean;
  productionTimeDays: string;
}

interface ProductVariantsFormProps {
  productId: string;
  variants: ProductVariantData[];
}

function toDraft(variant: ProductVariantData): VariantDraft {
  return {
    price: (variant.priceMinor / 100).toFixed(2),
    taxClassCode: variant.taxClassCode,
    weightGrams: variant.weightGrams?.toString() ?? "",
    isActive: variant.isActive,
    isLimitedEdition: variant.inventory?.isLimitedEdition ?? false,
    productionTimeDays: variant.inventory?.productionTimeDays?.toString() ?? "",
  };
}

type ErrorKind = "unknownTaxClass" | "generic" | null;

// Simple-field patch only — priceMinor/taxClassCode/weightGrams/isActive/
// isLimitedEdition/productionTimeDays, matched by existing variant id
// (admin-products.service.ts). Adding/removing variants or options on an
// already-created product is deliberately not built here (create-time is
// still the only way to define a product's variant matrix); stock levels
// (onHand/reserved) stay exclusively in the existing Inventory module,
// shown here read-only for context.
export function ProductVariantsForm({ productId, variants }: ProductVariantsFormProps) {
  const t = useTranslations("Products.detail");
  const router = useRouter();

  const [drafts, setDrafts] = useState<Record<string, VariantDraft>>(() =>
    Object.fromEntries(variants.map((v) => [v.id, toDraft(v)])),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  function updateDraft<K extends keyof VariantDraft>(variantId: string, field: K, value: VariantDraft[K]) {
    setSavedId(null);
    setDrafts((current) => {
      const existing = current[variantId];
      return existing ? { ...current, [variantId]: { ...existing, [field]: value } } : current;
    });
  }

  async function handleSave(event: FormEvent, variantId: string) {
    event.preventDefault();
    const draft = drafts[variantId];
    if (!draft) return; // defensive — every variant id rendered has a draft seeded from the same list
    setErrorKind(null);
    setSavedId(null);
    setPendingId(variantId);

    const { error } = await api.PATCH("/api/v1/admin/products/{id}", {
      params: { path: { id: productId } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: {
        variants: [
          {
            id: variantId,
            priceMinor: Math.round(Number.parseFloat(draft.price || "0") * 100),
            taxClassCode: draft.taxClassCode,
            weightGrams: draft.weightGrams ? Number.parseInt(draft.weightGrams, 10) : undefined,
            isActive: draft.isActive,
            isLimitedEdition: draft.isLimitedEdition,
            productionTimeDays: draft.productionTimeDays
              ? Number.parseInt(draft.productionTimeDays, 10)
              : undefined,
          },
        ],
      },
    });

    setPendingId(null);

    if (error) {
      const code = (error as { error?: string }).error;
      setErrorKind(code === "UnknownTaxClass" ? "unknownTaxClass" : "generic");
      return;
    }

    setSavedId(variantId);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {errorKind ? (
        <Alert tone="danger">
          {errorKind === "unknownTaxClass" ? t("unknownTaxClassError") : t("genericError")}
        </Alert>
      ) : null}

      {variants.map((variant) => {
        const draft = drafts[variant.id];
        if (!draft) return null; // defensive — seeded from this same variants list on mount
        return (
          <Card key={variant.id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Heading level={3}>{variant.sku}</Heading>
              {Object.keys(variant.selectedOptionValues).length > 0 ? (
                <Text size="sm" className="text-neutral-600">
                  {Object.entries(variant.selectedOptionValues)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(" · ")}
                </Text>
              ) : null}
            </div>

            {variant.inventory ? (
              <Text size="sm" className="text-neutral-600">
                {t("stockOnHand", { count: variant.inventory.onHand })} ·{" "}
                {t("stockReserved", { count: variant.inventory.reserved })}
              </Text>
            ) : null}

            {savedId === variant.id ? <Alert tone="success">{t("savedMessage")}</Alert> : null}

            <form onSubmit={(e) => handleSave(e, variant.id)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-neutral-800">{t("priceLabel")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.price}
                  onChange={(e) => updateDraft(variant.id, "price", e.target.value)}
                  className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-neutral-800">{t("taxClassCodeLabel")}</span>
                <input
                  value={draft.taxClassCode}
                  onChange={(e) => updateDraft(variant.id, "taxClassCode", e.target.value)}
                  className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-neutral-800">{t("weightGramsLabel")}</span>
                <input
                  type="number"
                  min="1"
                  value={draft.weightGrams}
                  onChange={(e) => updateDraft(variant.id, "weightGrams", e.target.value)}
                  className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-neutral-800">{t("productionTimeDaysLabel")}</span>
                <input
                  type="number"
                  min="1"
                  value={draft.productionTimeDays}
                  onChange={(e) => updateDraft(variant.id, "productionTimeDays", e.target.value)}
                  className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                />
              </label>

              <div className="flex flex-wrap items-center gap-6 sm:col-span-2 lg:col-span-4">
                <label className="flex items-center gap-2 text-sm text-neutral-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    checked={draft.isActive}
                    onChange={(e) => updateDraft(variant.id, "isActive", e.target.checked)}
                  />
                  {t("isActiveLabel")}
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    checked={draft.isLimitedEdition}
                    onChange={(e) => updateDraft(variant.id, "isLimitedEdition", e.target.checked)}
                  />
                  {t("isLimitedEditionLabel")}
                </label>
                <Button type="submit" variant="secondary" disabled={pendingId === variant.id}>
                  {pendingId === variant.id ? <Spinner className="h-4 w-4" /> : null}
                  {t("save")}
                </Button>
              </div>
            </form>
          </Card>
        );
      })}
    </div>
  );
}
