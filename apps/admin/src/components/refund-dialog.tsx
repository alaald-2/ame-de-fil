"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Alert,
  Dialog,
  DialogTrigger,
  DialogContent,
  FormField,
  Input,
  Textarea,
  Spinner,
} from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

interface RefundDialogProps {
  orderId: string;
  defaultAmountMinor: number;
}

type RefundErrorKind = "exceedsRemaining" | "noRefundablePayment" | "generic" | null;

// Amount-based only (the backend's own design — admin-orders.service.ts
// never accepts a set of line items to refund), defaulting to the order's
// full total; the admin can edit it down for a partial refund. The real
// refundable ceiling lives only in the backend's own locked transaction
// (this response has no "remaining refundable" figure to pre-validate
// against), so an over-amount attempt is caught server-side and surfaced
// here via its own translated message, not guessed at client-side.
export function RefundDialog({ orderId, defaultAmountMinor }: RefundDialogProps) {
  const t = useTranslations("Orders.refund");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState(() => (defaultAmountMinor / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<RefundErrorKind>(null);
  // One idempotency key per open dialog "attempt" — regenerated each time
  // the dialog opens fresh, reused across retries of that same attempt
  // (same idiom as storefront's checkout-form.tsx).
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorKind(null);
    setIsSubmitting(true);

    const amountMinor = Math.round(Number.parseFloat(amount) * 100);
    const { error, response } = await api.POST("/api/v1/admin/orders/{orderId}/refund", {
      params: {
        path: { orderId },
        header: { "idempotency-key": idempotencyKeyRef.current },
      },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: { amountMinor, reason: reason || undefined },
    });

    setIsSubmitting(false);

    if (error) {
      if (response.status === 400) {
        setErrorKind(error.error === "NoRefundablePayment" ? "noRefundablePayment" : "exceedsRemaining");
      } else {
        setErrorKind("generic");
      }
      return;
    }

    setIsOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          idempotencyKeyRef.current = crypto.randomUUID();
          setAmount((defaultAmountMinor / 100).toFixed(2));
          setReason("");
          setErrorKind(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">{t("action")}</Button>
      </DialogTrigger>
      <DialogContent title={t("dialogTitle")} description={t("dialogDescription")} closeLabel={t("close")}>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            {errorKind ? (
              <Alert tone="danger">
                {errorKind === "exceedsRemaining"
                  ? t("exceedsRemainingError")
                  : errorKind === "noRefundablePayment"
                    ? t("noRefundablePaymentError")
                    : t("genericError")}
              </Alert>
            ) : null}
            <FormField label={t("amountLabel")} required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t("reasonLabel")}>
              {(fieldProps) => (
                <Textarea {...fieldProps} value={reason} onChange={(e) => setReason(e.target.value)} />
              )}
            </FormField>
          </div>
          <div className="mt-6 flex justify-end gap-3">
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
      </DialogContent>
    </Dialog>
  );
}
