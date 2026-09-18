"use client";

import { useState, type FormEvent } from "react";
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
  Text,
  Spinner,
} from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

interface AdjustStockDialogProps {
  variantId: string;
  productName: string;
  sku: string;
  onHand: number;
}

type MovementType = "RESTOCK" | "ADJUSTMENT";
type ErrorKind = "generic" | null;

// The only admin surface for POST /admin/inventory/:variantId/adjustments
// (inventory.adjust) — that endpoint existed with no caller anywhere in
// this app; onHand could only ever be set once, at product-creation time
// (create-product-form.tsx's "Initial stock" field), with no way to
// restock or correct it afterward. `delta` is relative (can be negative,
// zod's own adjustStockSchema rejects zero), never an absolute "set to"
// value — the backend records every change as an auditable
// InventoryMovement, not a silent overwrite.
export function AdjustStockDialog({ variantId, productName, sku, onHand }: AdjustStockDialogProps) {
  const t = useTranslations("Inventory.adjust");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [type, setType] = useState<MovementType>("RESTOCK");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);

  function reset() {
    setDelta("");
    setType("RESTOCK");
    setReason("");
    setErrorKind(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const deltaValue = Number.parseInt(delta, 10);
    if (!Number.isInteger(deltaValue) || deltaValue === 0 || !reason.trim()) return;

    setErrorKind(null);
    setIsSubmitting(true);
    const { error } = await api.POST("/api/v1/admin/inventory/{variantId}/adjustments", {
      params: { path: { variantId } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: { delta: deltaValue, reason: reason.trim(), type },
    });
    setIsSubmitting(false);

    if (error) {
      setErrorKind("generic");
      return;
    }

    setIsOpen(false);
    router.refresh();
  }

  const parsedDelta = Number.parseInt(delta, 10);
  const canSubmit = Number.isInteger(parsedDelta) && parsedDelta !== 0 && reason.trim().length > 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">{t("action")}</Button>
      </DialogTrigger>
      <DialogContent
        title={t("dialogTitle", { productName })}
        description={t("dialogDescription", { sku })}
        closeLabel={t("close")}
      >
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            {errorKind ? <Alert tone="danger">{t("genericError")}</Alert> : null}
            <Text size="sm" tone="muted">
              {t("currentOnHand", { count: onHand })}
            </Text>
            <FormField label={t("deltaLabel")} hint={t("deltaHint")} required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="number"
                  step="1"
                  required
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                />
              )}
            </FormField>
            <fieldset>
              <legend className="font-sans text-sm font-medium text-neutral-800">
                {t("typeLabel")}
              </legend>
              <div className="mt-1.5 flex gap-4">
                <label className="flex items-center gap-2 text-sm text-neutral-800">
                  <input
                    type="radio"
                    name="movement-type"
                    checked={type === "RESTOCK"}
                    onChange={() => setType("RESTOCK")}
                    className="h-4 w-4 border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  />
                  {t("typeRestock")}
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-800">
                  <input
                    type="radio"
                    name="movement-type"
                    checked={type === "ADJUSTMENT"}
                    onChange={() => setType("ADJUSTMENT")}
                    className="h-4 w-4 border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  />
                  {t("typeAdjustment")}
                </label>
              </div>
            </fieldset>
            <FormField label={t("reasonLabel")} required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  required
                  placeholder={t("reasonPlaceholder")}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </FormField>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
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
