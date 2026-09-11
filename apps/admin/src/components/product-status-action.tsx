"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Alert, Spinner } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import { nextProductStatus } from "../lib/product-status";

interface ProductStatusActionProps {
  productId: string;
  status: string;
}

type ErrorKind = "conflict" | "generic" | null;

// Exactly one control for the current status, mirroring
// order-fulfillment-actions.tsx's own "one action per state" posture — the
// backend's LEGAL_STATUS_TRANSITIONS (admin-products.service.ts) is the
// real enforcement, this only decides which single button to render.
export function ProductStatusAction({ productId, status }: ProductStatusActionProps) {
  const t = useTranslations("Products.detail");
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);

  const next = nextProductStatus(status);
  if (!next) return null;

  async function handleClick() {
    setErrorKind(null);
    setIsSubmitting(true);

    const { error, response } = await api.PATCH("/api/v1/admin/products/{id}", {
      params: { path: { id: productId } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: { status: next as "PUBLISHED" | "ARCHIVED" },
    });

    setIsSubmitting(false);

    if (error) {
      setErrorKind(response.status === 409 ? "conflict" : "generic");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      {errorKind ? (
        <Alert tone="danger" className="mb-3">
          {errorKind === "conflict" ? t("statusConflictError") : t("genericError")}
        </Alert>
      ) : null}
      <Button variant={next === "ARCHIVED" ? "secondary" : "primary"} onClick={handleClick} disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner className="h-4 w-4" /> {t("working")}
          </>
        ) : next === "PUBLISHED" ? (
          t("publish")
        ) : (
          t("archive")
        )}
      </Button>
    </div>
  );
}
