"use client";

import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Heading, Text, Button, Input, FormField, Alert, Spinner } from "@ame-de-fil/ui";
import type { ShippingMethod, CheckoutResponse, InitiateCheckoutRequest, AddressResponse } from "@ame-de-fil/types";
import { api } from "../lib/api-client";
import { getErrorMessage, getErrorCode } from "../lib/error-message";
import { readCsrfCookie } from "../lib/csrf";
import { formatMoney } from "../lib/format-money";
import { saveCheckoutOrder } from "../lib/checkout-order-storage";
import type { AppLocale } from "../lib/locale";
import { useCart } from "./cart-provider";
import { ResendVerificationButton } from "./resend-verification-button";

interface CheckoutFormProps {
  locale: AppLocale;
  shippingMethods: ShippingMethod[];
  // Empty for a guest or a signed-in customer with no saved addresses — the
  // picker below simply never renders in either case, and the form behaves
  // exactly as it did before this existed (design discussion, docs/plans).
  savedAddresses: AddressResponse[];
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

// The default saved address (guaranteed unique whenever savedAddresses is
// non-empty — AddressesService's own invariant, docs/plans) seeds the
// address fields the exact same way shippingMethods[0] already seeds
// shippingMethodId — a one-time copy into local form state, not an effect.
function initialFormState(shippingMethods: ShippingMethod[], savedAddresses: AddressResponse[]): FormState {
  const defaultAddress = savedAddresses.find((address) => address.isDefault);
  return {
    guestEmail: "",
    name: defaultAddress?.name ?? "",
    line1: defaultAddress?.line1 ?? "",
    line2: defaultAddress?.line2 ?? "",
    postalCode: defaultAddress?.postalCode ?? "",
    city: defaultAddress?.city ?? "",
    phone: defaultAddress?.phone ?? "",
    shippingMethodId: shippingMethods[0]?.id ?? "",
  };
}

// The sentinel "Enter a new address" option's <select> value — never a real
// address id (cuid()s never collide with a literal empty string).
const NEW_ADDRESS_OPTION = "";

// Both guest and authenticated checkout are supported (apps/api's
// @OptionalAuth() checkout endpoint). An authenticated-but-unverified
// customer gets a distinct 403 EmailNotVerified (apps/api's
// EmailVerifiedGuard) — surfaced below via isEmailNotVerified, alongside a
// resend-verification action, rather than the generic error message.
export function CheckoutForm({ locale, shippingMethods, savedAddresses, onSuccess }: CheckoutFormProps) {
  const t = useTranslations("Checkout");
  const { cart } = useCart();
  const [form, setForm] = useState<FormState>(() => initialFormState(shippingMethods, savedAddresses));
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    () => savedAddresses.find((address) => address.isDefault)?.id ?? NEW_ADDRESS_OPTION,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEmailNotVerified, setIsEmailNotVerified] = useState(false);
  // One idempotency key per checkout attempt on this page — reused across
  // retries of the *same* submission (e.g. a network hiccup), not
  // regenerated per click, so a retry is recognized as the same request.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  // Only ever copies the same plain-text fields the form already collects
  // into local state — no addressId is ever sent to the API (see
  // handleSubmit's body below), so from checkout's perspective this is
  // indistinguishable from a customer typing the exact same values by hand.
  // Picking "Enter a new address" clears the fields back to blank; editing
  // afterward is just editing the form, same as always — there is no write
  // path back to the saved address at all.
  function handleAddressPick(addressId: string) {
    setSelectedAddressId(addressId);
    const picked = savedAddresses.find((address) => address.id === addressId);
    setForm((previous) => ({
      ...previous,
      name: picked?.name ?? "",
      line1: picked?.line1 ?? "",
      line2: picked?.line2 ?? "",
      postalCode: picked?.postalCode ?? "",
      city: picked?.city ?? "",
      phone: picked?.phone ?? "",
    }));
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
    setIsEmailNotVerified(false);
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
      if (getErrorCode(error) === "EmailNotVerified") {
        setIsEmailNotVerified(true);
      } else {
        setErrorMessage(getErrorMessage(error, "Checkout failed"));
      }
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
            {savedAddresses.length > 0 ? (
              <FormField label={t("useSavedAddress")}>
                {(fieldProps) => (
                  <select
                    {...fieldProps}
                    value={selectedAddressId}
                    onChange={(e) => handleAddressPick(e.target.value)}
                    className="w-full rounded-sm border border-neutral-300 bg-white px-3 py-2 font-sans text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  >
                    {savedAddresses.map((address) => (
                      <option key={address.id} value={address.id}>
                        {address.label || `${address.name} — ${address.line1}`}
                      </option>
                    ))}
                    <option value={NEW_ADDRESS_OPTION}>{t("enterNewAddress")}</option>
                  </select>
                )}
              </FormField>
            ) : null}
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
        {isEmailNotVerified ? (
          <Alert tone="danger">
            <Text size="sm">{t("emailNotVerified")}</Text>
            <div className="mt-3">
              <ResendVerificationButton />
            </div>
          </Alert>
        ) : null}

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
          {/* This total already IS the final total — checkout/pricing.ts's own
              comment confirms totalMinor = subtotalMinor + shippingMinor,
              tax is VAT embedded within those prices, not added on top, so
              there's no larger number waiting on the confirmation page. This
              note only exists so that page's own "of which VAT" breakdown
              line doesn't read as a late addition to what's shown here — the
              exact VAT split isn't computable client-side pre-order (cart
              items/shipping methods carry no tax-rate field, only the
              order snapshot does once checkout has run). */}
          <Text size="sm" tone="muted" className="mt-1">
            {t("pricesIncludeVat")}
          </Text>
        </div>
      </aside>
    </div>
  );
}
