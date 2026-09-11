"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Heading, Text, Button, Alert, FormField, Input, Spinner } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import { PromotionVariantPicker, type VariantOption } from "./promotion-variant-picker";
import type { AdminLocale } from "../i18n/config";

interface CreatePromotionFormProps {
  variantOptions: VariantOption[];
  locale: AdminLocale;
}

type ErrorKind = "invalidPercentage" | "invalidDateRange" | "unknownVariant" | "conflict" | "generic" | null;

// One-shot creation, same posture as create-product-form.tsx: no draft-save
// step, since POST /admin/promotions has no partial-create counterpart.
export function CreatePromotionForm({ variantOptions, locale }: CreatePromotionFormProps) {
  const t = useTranslations("Promotions.create");
  const router = useRouter();

  const [name, setName] = useState("");
  const [percentage, setPercentage] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [active, setActive] = useState(true);
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const percentageNumber = Number.parseInt(percentage, 10);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorKind(null);
    setConflictMessage(null);

    if (variantIds.length === 0) {
      setErrorKind("unknownVariant");
      return;
    }

    setIsSubmitting(true);

    const { data, error, response } = await api.POST("/api/v1/admin/promotions", {
      headers: { "x-csrf-token": readCsrfCookie() },
      body: {
        name,
        percentage: percentageNumber,
        // Plain <input type="date"> gives "YYYY-MM-DD" — sent as UTC
        // midnight, same convention as dashboard-date-range-form.tsx's own
        // date-only inputs.
        startsAt: startsAt ? `${startsAt}T00:00:00.000Z` : undefined,
        endsAt: endsAt ? `${endsAt}T00:00:00.000Z` : undefined,
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

    router.push(`/promotions/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex max-w-2xl flex-col gap-8">
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

      <section>
        <Heading level={2} className="mb-1">
          {t("detailsHeading")}
        </Heading>
        <Text size="sm" tone="muted" className="mb-4">
          {t("detailsHint")}
        </Text>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("nameLabel")} required>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
              />
            )}
          </FormField>
          <FormField label={t("percentageLabel")} required hint={t("percentageHint")}>
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
              <Spinner className="h-4 w-4" /> {t("submit")}
            </>
          ) : (
            t("submit")
          )}
        </Button>
      </div>
    </form>
  );
}
