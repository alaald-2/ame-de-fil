"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Heading, Text, Button, Alert, FormField, Input, Spinner } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

export interface StoreSettingsData {
  businessName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  orgNumber: string | null;
  vatNumber: string | null;
  phone: string | null;
  email: string | null;
  showAddress: boolean;
  showOrgNumber: boolean;
  showVatNumber: boolean;
  showPhone: boolean;
  showEmail: boolean;
}

interface StoreSettingsFormProps {
  settings: StoreSettingsData;
}

interface Draft {
  businessName: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  orgNumber: string;
  vatNumber: string;
  phone: string;
  email: string;
  showAddress: boolean;
  showOrgNumber: boolean;
  showVatNumber: boolean;
  showPhone: boolean;
  showEmail: boolean;
}

function toDraft(settings: StoreSettingsData): Draft {
  return {
    businessName: settings.businessName ?? "",
    addressLine1: settings.addressLine1 ?? "",
    addressLine2: settings.addressLine2 ?? "",
    postalCode: settings.postalCode ?? "",
    city: settings.city ?? "",
    country: settings.country ?? "",
    orgNumber: settings.orgNumber ?? "",
    vatNumber: settings.vatNumber ?? "",
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    showAddress: settings.showAddress,
    showOrgNumber: settings.showOrgNumber,
    showVatNumber: settings.showVatNumber,
    showPhone: settings.showPhone,
    showEmail: settings.showEmail,
  };
}

// This business info is letterhead content for the printed order receipt
// (order-receipt.tsx) — the show* toggles below control which of it
// actually appears there; the receipt's real substance (order, items,
// totals) is never toggleable.
export function StoreSettingsForm({ settings }: StoreSettingsFormProps) {
  const t = useTranslations("Administration.storeSettings");
  const router = useRouter();

  const [draft, setDraft] = useState<Draft>(toDraft(settings));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<"generic" | null>(null);
  const [saved, setSaved] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);

  // This form is long enough that the Save button sits well below the
  // fold — without this, a failure (or success) rendered only in the
  // top-of-form banner was invisible from where the admin was actually
  // scrolled, which read as "I clicked Save and nothing happened" (the
  // "no navigation" half of the freeze report) even on a request that
  // failed and recovered correctly.
  useEffect(() => {
    if (errorKind || saved) {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [errorKind, saved]);

  function updateField(field: keyof Draft, value: string | boolean) {
    setSaved(false);
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorKind(null);
    setSaved(false);
    setIsSubmitting(true);

    // A genuine network failure (offline, DNS, CORS) makes fetch() itself
    // reject rather than resolve to openapi-fetch's own {error} shape —
    // without this try/catch, that rejection was never caught, so
    // setIsSubmitting(false) below never ran and the Save button stayed
    // permanently disabled/spinning (the "screen freezes" report). A
    // 10s AbortController timeout closes the matching case where the
    // request neither resolves nor rejects in any reasonable time.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const { error } = await api.PATCH("/api/v1/admin/store-settings", {
        headers: { "x-csrf-token": readCsrfCookie() },
        body: draft,
        signal: controller.signal,
      });

      if (error) {
        setErrorKind("generic");
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setErrorKind("generic");
    } finally {
      clearTimeout(timeout);
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-8">
      <div ref={feedbackRef}>
        {errorKind ? <Alert tone="danger">{t("genericError")}</Alert> : null}
        {saved ? <Alert tone="success">{t("savedMessage")}</Alert> : null}
      </div>

      <section>
        <Heading level={2} className="mb-1">
          {t("businessInfoHeading")}
        </Heading>
        <Text size="sm" tone="muted" className="mb-4">
          {t("businessInfoHint")}
        </Text>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("businessNameLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={draft.businessName}
                onChange={(e) => updateField("businessName", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("phoneLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={draft.phone}
                onChange={(e) => updateField("phone", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("addressLine1Label")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={draft.addressLine1}
                onChange={(e) => updateField("addressLine1", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("addressLine2Label")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={draft.addressLine2}
                onChange={(e) => updateField("addressLine2", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("postalCodeLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={draft.postalCode}
                onChange={(e) => updateField("postalCode", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("cityLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={draft.city}
                onChange={(e) => updateField("city", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("countryLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={draft.country}
                onChange={(e) => updateField("country", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("emailLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={draft.email}
                onChange={(e) => updateField("email", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("orgNumberLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={draft.orgNumber}
                onChange={(e) => updateField("orgNumber", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("vatNumberLabel")}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={draft.vatNumber}
                onChange={(e) => updateField("vatNumber", e.target.value)}
              />
            )}
          </FormField>
        </div>
      </section>

      <section>
        <Heading level={2} className="mb-1">
          {t("receiptHeading")}
        </Heading>
        <Text size="sm" tone="muted" className="mb-4">
          {t("receiptHint")}
        </Text>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t("receiptHeading")}</legend>
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              checked={draft.showAddress}
              onChange={(e) => updateField("showAddress", e.target.checked)}
            />
            {t("showAddressLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              checked={draft.showOrgNumber}
              onChange={(e) => updateField("showOrgNumber", e.target.checked)}
            />
            {t("showOrgNumberLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              checked={draft.showVatNumber}
              onChange={(e) => updateField("showVatNumber", e.target.checked)}
            />
            {t("showVatNumberLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              checked={draft.showPhone}
              onChange={(e) => updateField("showPhone", e.target.checked)}
            />
            {t("showPhoneLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              checked={draft.showEmail}
              onChange={(e) => updateField("showEmail", e.target.checked)}
            />
            {t("showEmailLabel")}
          </label>
        </fieldset>
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
