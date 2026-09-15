"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Heading, Alert, Card, FormField, Input, Button, Stack, Spinner } from "@ame-de-fil/ui";
import type { AddressResponse } from "@ame-de-fil/types";
import { useRouter } from "../i18n/navigation";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

interface AddressFormProps {
  /** Present in edit mode (PATCH), absent in create mode (POST). */
  address?: AddressResponse;
}

// Mirrors create-account-form.tsx's shape (Card/Stack/FormField, "server is
// the source of truth, no client-side zod" posture). The "set as default"
// checkbox uses the plain <input type="checkbox"> markup
// create-promotion-form.tsx already establishes — no dedicated Checkbox
// component exists in packages/ui. Only ever sends isDefault: true (never
// false) — the default-address invariant (docs/plans) means there is no
// client-facing way to unset a default directly, so the checkbox is simply
// omitted from the request body when unchecked rather than sent as false.
export function AddressForm({ address }: AddressFormProps) {
  const t = useTranslations("Account.Addresses");
  const router = useRouter();
  const isEditMode = address !== undefined;

  const [label, setLabel] = useState(address?.label ?? "");
  const [name, setName] = useState(address?.name ?? "");
  const [line1, setLine1] = useState(address?.line1 ?? "");
  const [line2, setLine2] = useState(address?.line2 ?? "");
  const [postalCode, setPostalCode] = useState(address?.postalCode ?? "");
  const [city, setCity] = useState(address?.city ?? "");
  const [phone, setPhone] = useState(address?.phone ?? "");
  const [setDefault, setSetDefault] = useState(address?.isDefault ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setHasError(false);
    setIsSubmitting(true);

    const body = {
      label: label || undefined,
      name,
      line1,
      line2: line2 || undefined,
      postalCode,
      city,
      phone: phone || undefined,
      ...(setDefault ? { isDefault: true as const } : {}),
    };

    try {
      const { error } = isEditMode
        ? await api.PATCH("/api/v1/addresses/{addressId}", {
            params: { path: { addressId: address.id } },
            headers: { "x-csrf-token": readCsrfCookie() },
            body,
          })
        : await api.POST("/api/v1/addresses", {
            headers: { "x-csrf-token": readCsrfCookie() },
            body,
          });

      if (error) {
        setHasError(true);
        return;
      }

      router.push("/account/addresses");
      router.refresh();
    } catch {
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <Card className="p-8">
        <Heading level={2} className="mb-6">
          {isEditMode ? t("editTitle") : t("addTitle")}
        </Heading>

        {hasError ? (
          <Alert tone="danger" className="mb-6">
            {t("genericError")}
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <FormField label={t("labelField")}>
              {(fieldProps) => (
                <Input {...fieldProps} value={label} onChange={(e) => setLabel(e.target.value)} />
              )}
            </FormField>
            <FormField label={t("fullName")} required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("addressLine1")} required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  autoComplete="address-line1"
                  required
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("addressLine2")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  autoComplete="address-line2"
                  value={line2}
                  onChange={(e) => setLine2(e.target.value)}
                />
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("postalCode")} required>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    autoComplete="postal-code"
                    required
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                )}
              </FormField>
              <FormField label={t("city")} required>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    autoComplete="address-level2"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <FormField label={t("phone")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              )}
            </FormField>

            <label className="mt-2 flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-sm border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                checked={setDefault}
                disabled={isEditMode && address.isDefault}
                onChange={(e) => setSetDefault(e.target.checked)}
              />
              {t("setAsDefault")}
            </label>

            <Button type="submit" variant="secondary" disabled={isSubmitting} className="mt-2">
              {isSubmitting ? (
                <>
                  <Spinner className="h-4 w-4" /> {t("submitting")}
                </>
              ) : (
                t("save")
              )}
            </Button>
          </Stack>
        </form>
      </Card>
    </div>
  );
}
