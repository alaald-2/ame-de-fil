"use client";

import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Heading, Text, Button, Input, FormField, Alert, Spinner } from "@ame-de-fil/ui";
import type { ShippingMethod, CheckoutResponse, InitiateCheckoutRequest } from "@ame-de-fil/types";
import { api } from "../lib/api-client";
import { getErrorMessage } from "../lib/error-message";
import { readCsrfCookie } from "../lib/csrf";
import { formatMoney } from "../lib/format-money";
import { saveCheckoutOrder } from "../lib/checkout-order-storage";
import type { AppLocale } from "../lib/locale";
import { useCart } from "./cart-provider";

interface CheckoutFormProps {
  locale: AppLocale;
  shippingMethods: ShippingMethod[];
  onSuccess: (order: CheckoutResponse) => void;
}

interface FormState {
  guestEmail: string;
  name: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  phone: string;
  shippingMethodId: string;
}

function initialFormState(shippingMethods: ShippingMethod[]): FormState {
  return {
    guestEmail: "",
    name: "",
    line1: "",
    line2: "",
    postalCode: "",
    city: "",
    phone: "",
    shippingMethodId: shippingMethods[0]?.id ?? "",
  };
}

// No login/registration flow reaches the storefront yet (identity's own
// checkpoint notes: "no login/password-reset HTTP endpoints yet") — every
// checkout exercised through this form is necessarily a guest checkout.
// The API's authenticated-checkout path exists and is covered by
// checkout.service.spec.ts/checkout.controller.spec.ts; this form simply
// has no session to drive it with yet.
export function CheckoutForm({ locale, shippingMethods, onSuccess }: CheckoutFormProps) {
  const t = useTranslations("Checkout");
  const { cart } = useCart();
  const [form, setForm] = useState<FormState>(() => initialFormState(shippingMethods));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // One idempotency key per checkout attempt on this page — reused across
  // retries of the *same* submission (e.g. a network hiccup), not
  // regenerated per click, so a retry is recognized as the same request.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  // Estimate only, for the review panel — the API recalculates shipping
  // (and everything else) authoritatively on submit; the client never
  // decides the real total.
  const selectedShippingMethod = shippingMethods.find(
    (method) => method.id === form.shippingMethodId,
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const body: InitiateCheckoutRequest = {
      locale,
      shippingMethodId: form.shippingMethodId,
      guestEmail: form.guestEmail,
      shippingAddress: {
        name: form.name,
        line1: form.line1,
        line2: form.line2 || undefined,
        postalCode: form.postalCode,
        city: form.city,
        country: "SE",
        phone: form.phone || undefined,
      },
    };

    const { data, error } = await api.POST("/api/v1/checkout", {
      params: { header: { "idempotency-key": idempotencyKeyRef.current } },
      // @OptionalAuth() — required once a customer is signed in
      // (cart-store.ts's own comment on the identical CsrfGuard interaction).
      headers: { "x-csrf-token": readCsrfCookie() },
      body,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(getErrorMessage(error, "Checkout failed"));
      return;
    }

    // Persisted before handing off — the payment/polling steps (and a
    // possible Stripe 3DS redirect landing on /checkout/complete) read it
    // back from sessionStorage, since a plain React state variable
    // wouldn't survive a full-page redirect (checkout-order-storage.ts).
    saveCheckoutOrder(data);
    onSuccess(data);
  }

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_360px]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        <div>
          <Heading level={2}>{t("deliveryInformation")}</Heading>
          <div className="mt-4 flex flex-col gap-4">
            <FormField label={t("email")} required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="email"
                  required
                  value={form.guestEmail}
                  onChange={(e) => updateField("guestEmail", e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("fullName")} required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  required
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("addressLine1")} required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  required
                  value={form.line1}
                  onChange={(e) => updateField("line1", e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("addressLine2")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={form.line2}
                  onChange={(e) => updateField("line2", e.target.value)}
                />
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label={t("postalCode")} required>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    required
                    value={form.postalCode}
                    onChange={(e) => updateField("postalCode", e.target.value)}
                  />
                )}
              </FormField>
              <FormField label={t("city")} required>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    required
                    value={form.city}
                    onChange={(e) => updateField("city", e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <FormField label={t("phone")}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                />
              )}
            </FormField>
            <div>
              <Text size="sm" tone="muted">
                {t("country")}: {t("countrySwedenOnly")}
              </Text>
            </div>
          </div>
        </div>

        <div>
          <Heading level={2}>{t("shippingMethod")}</Heading>
          <div className="mt-4 flex flex-col gap-3">
            {shippingMethods.length === 0 ? (
              <Text tone="muted">{t("noShippingMethods")}</Text>
            ) : (
              shippingMethods.map((method) => (
                <label
                  key={method.id}
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-sm border border-neutral-300 px-4 py-3 has-[:checked]:border-neutral-900"
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="shippingMethod"
                      value={method.id}
                      checked={form.shippingMethodId === method.id}
                      onChange={() => updateField("shippingMethodId", method.id)}
                      required
                    />
                    <span>
                      <Text>{method.name}</Text>
                      <Text size="sm" tone="muted">
                        {t("deliveryEstimate", {
                          min: method.minDeliveryDays,
                          max: method.maxDeliveryDays,
                        })}
                      </Text>
                    </span>
                  </span>
                  <Text>{formatMoney(method.price.amountMinor, locale)}</Text>
                </label>
              ))
            )}
          </div>
        </div>

        {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}

        <Button type="submit" disabled={isSubmitting || shippingMethods.length === 0}>
          {isSubmitting ? (
            <>
              <Spinner className="h-4 w-4" /> {t("placingOrder")}
            </>
          ) : (
            t("placeOrder")
          )}
        </Button>
      </form>

      <aside className="h-fit rounded-sm border border-neutral-200 p-6">
        <Heading level={2}>{t("orderReview")}</Heading>
        <div className="mt-4 flex flex-col gap-2">
          {cart.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-4">
              <Text size="sm">
                {item.productName} × {item.quantity}
              </Text>
              <Text size="sm">{formatMoney(item.lineTotal.amountMinor, locale)}</Text>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-1 border-t border-neutral-200 pt-4">
          <div className="flex justify-between">
            <Text size="sm" tone="muted">
              {t("subtotal")}
            </Text>
            <Text size="sm">{formatMoney(cart.subtotal.amountMinor, locale)}</Text>
          </div>
          <div className="flex justify-between">
            <Text size="sm" tone="muted">
              {t("shipping")}
            </Text>
            <Text size="sm">
              {selectedShippingMethod
                ? formatMoney(selectedShippingMethod.price.amountMinor, locale)
                : "—"}
            </Text>
          </div>
          <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2">
            <Text>{t("total")}</Text>
            <Text>
              {formatMoney(
                cart.subtotal.amountMinor + (selectedShippingMethod?.price.amountMinor ?? 0),
                locale,
              )}
            </Text>
          </div>
        </div>
      </aside>
    </div>
  );
}
