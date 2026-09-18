"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Heading, Text, Button, Alert, Badge, FormField, Input, Spinner } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import { PromotionVariantPicker, type VariantOption } from "./promotion-variant-picker";
import type { AdminLocale } from "../i18n/config";

interface PromotionDetailFormProps {
  promotionId: string;
  name: string;
  percentage: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  effective: boolean;
  variantIds: string[];
  variantOptions: VariantOption[];
  locale: AdminLocale;
}

type ErrorKind = "invalidDateRange" | "unknownVariant" | "conflict" | "generic" | null;

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

// Everything about a promotion — including activate/deactivate — is one
// PATCH body (`active` is just another field), not a separate action
// endpoint; see promotions.controller.ts's own comment for why. Always
// submits every field on save (never diffs), same "save means persist
// everything currently edited" posture as product-details-form.tsx.
export function PromotionDetailForm({
  promotionId,
  name: initialName,
  percentage: initialPercentage,
  startsAt: initialStartsAt,
  endsAt: initialEndsAt,
  active: initialActive,
  effective,
  variantIds: initialVariantIds,
  variantOptions,
  locale,
}: PromotionDetailFormProps) {
  const t = useTranslations("Promotions.detail");
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [percentage, setPercentage] = useState(String(initialPercentage));
  const [startsAt, setStartsAt] = useState(toDateInputValue(initialStartsAt));
  const [endsAt, setEndsAt] = useState(toDateInputValue(initialEndsAt));
  const [active, setActive] = useState(initialActive);
  const [variantIds, setVariantIds] = useState<string[]>(initialVariantIds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const percentageNumber = Number.parseInt(percentage, 10);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorKind(null);
    setConflictMessage(null);
    setSaved(false);

    if (variantIds.length === 0) {
      setErrorKind("unknownVariant");
      return;
    }

    setIsSubmitting(true);

    const { error, response } = await api.PATCH("/api/v1/admin/promotions/{id}", {
      params: { path: { id: promotionId } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: {
        name,
        percentage: percentageNumber,
        startsAt: startsAt ? `${startsAt}T00:00:00.000Z` : null,
        endsAt: endsAt ? `${endsAt}T00:00:00.000Z` : null,
        active,
        variantIds,
      },
    });

    setIsSubmitting(false);

    if (error) {
      if (response.status === 409) {
        setErrorKind("conflict");
        setConflictMessage((error as { message?: string }).message ?? null);
      } else if (response.status === 400) {
        const code = (error as { error?: string }).error;
        if (code === "UnknownVariant") setErrorKind("unknownVariant");
        else if (code === "InvalidDateRange") setErrorKind("invalidDateRange");
        else setErrorKind("generic");
      } else {
        setErrorKind("generic");
      }
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex max-w-2xl flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={active ? "success" : "neutral"}>
          {active ? t("statusActive") : t("statusInactive")}
        </Badge>
        {active ? (
          <Badge tone={effective ? "success" : "neutral"}>
            {effective ? t("statusEffective") : t("statusNotYetEffective")}
          </Badge>
        ) : null}
      </div>

      {errorKind ? (
        <Alert tone="danger">
          {errorKind === "conflict"
            ? (conflictMessage ?? t("conflictError"))
            : errorKind === "invalidDateRange"
              ? t("invalidDateRangeError")
              : errorKind === "unknownVariant"
                ? t("noVariantsError")
                : t("genericError")}
        </Alert>
      ) : null}
      {saved ? <Alert tone="success">{t("savedMessage")}</Alert> : null}

      <section>
        <Heading level={2} className="mb-4">
          {t("detailsHeading")}
        </Heading>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("nameLabel")} required>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("percentageLabel")} required>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="number"
                min="1"
                max="100"
                step="1"
                required
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
              />
            )}
          </FormField>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField label={t("startsAtLabel")} hint={t("optionalHint")}>
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="date"
                value={startsAt}
                max={endsAt || undefined}
                onChange={(e) => setStartsAt(e.target.value)}
                className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              />
            )}
          </FormField>
          <FormField label={t("endsAtLabel")} hint={t("optionalHint")}>
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="date"
                value={endsAt}
                min={startsAt || undefined}
                onChange={(e) => setEndsAt(e.target.value)}
                className="rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              />
            )}
          </FormField>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          {t("activeLabel")}
        </label>
      </section>

      <section>
        <Heading level={2} className="mb-1">
          {t("variantsHeading")}
        </Heading>
        <Text size="sm" tone="muted" className="mb-4">
          {t("variantsHint")}
        </Text>
        <PromotionVariantPicker
          options={variantOptions}
          selectedIds={variantIds}
          onChange={setVariantIds}
          percentage={Number.isFinite(percentageNumber) ? percentageNumber : 0}
          locale={locale}
        />
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner className="h-4 w-4" /> {t("save")}
            </>
          ) : (
            t("save")
          )}
        </Button>
      </div>
    </form>
  );
}
