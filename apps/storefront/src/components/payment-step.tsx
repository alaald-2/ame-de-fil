"use client";

import { useState, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useTranslations } from "next-intl";
import { Heading, Button, Alert, Spinner } from "@ame-de-fil/ui";
import { formatMoney } from "../lib/format-money";
import { getStripe } from "../lib/stripe";
import type { AppLocale } from "../lib/locale";

interface PaymentStepProps {
  clientSecret: string;
  amountMinor: number;
  locale: AppLocale;
  returnUrl: string;
  // Confirmation from stripe.confirmPayment is never trusted as "the order
  // is confirmed" (requirement 7) — this only advances the parent to the
  // polling step (order-status-poller.tsx), which is the sole source of
  // truth for whether the order actually confirmed.
  onConfirmationSubmitted: () => void;
}

function PaymentForm({
  amountMinor,
  locale,
  returnUrl,
  onConfirmationSubmitted,
}: Omit<PaymentStepProps, "clientSecret">) {
  const t = useTranslations("Checkout");
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    // redirect: "if_required" — only redirects to returnUrl when the
    // payment method genuinely needs it (e.g. a 3DS challenge); otherwise
    // resolves inline and this form advances straight to polling.
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message ?? t("paymentError"));
      return;
    }

    onConfirmationSubmitted();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Heading level={2}>{t("paymentHeading")}</Heading>
      <PaymentElement />
      {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}
      <Button type="submit" disabled={!stripe || isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner className="h-4 w-4" /> {t("payingButton")}
          </>
        ) : (
          t("payButton", { amount: formatMoney(amountMinor, locale) })
        )}
      </Button>
    </form>
  );
}

export function PaymentStep(props: PaymentStepProps) {
  return (
    <Elements stripe={getStripe()} options={{ clientSecret: props.clientSecret }}>
      <PaymentForm {...props} />
    </Elements>
  );
}
