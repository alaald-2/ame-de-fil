"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, Button, Dialog, DialogTrigger, DialogContent, Spinner } from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";

interface DeleteProductActionProps {
  productId: string;
}

type ErrorKind = "hasOrders" | "inCarts" | "generic" | null;

// The one irreversible action on this page — everything else here is a
// PATCH. Confirmed via the same Dialog pattern as an image's own delete
// button (product-images-form.tsx). Never rendered from the illegal-state
// side (products.delete is checked server-side too; see admin-products.
// service.ts's deleteProduct), so a 409 here always means the product
// picked up an order/cart reference after this page loaded, not that the
// button shouldn't have been shown at all.
export function DeleteProductAction({ productId }: DeleteProductActionProps) {
  const t = useTranslations("Products.detail");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);

  async function handleDelete() {
    setErrorKind(null);
    setIsDeleting(true);

    const { error, response } = await api.DELETE("/api/v1/admin/products/{id}", {
      params: { path: { id: productId } },
      headers: { "x-csrf-token": readCsrfCookie() },
    });

    setIsDeleting(false);

    if (error) {
      if (response.status === 409) {
        const code = (error as { error?: string }).error;
        setErrorKind(code === "ProductInCarts" ? "inCarts" : "hasOrders");
      } else {
        setErrorKind("generic");
      }
      return;
    }

    router.push("/products");
    router.refresh();
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost">
          {t("deleteButton")}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmDescription")}
        closeLabel={t("close")}
      >
        {errorKind ? (
          <Alert tone="danger">
            {errorKind === "hasOrders"
              ? t("deleteHasOrdersError")
              : errorKind === "inCarts"
                ? t("deleteInCartsError")
                : t("genericError")}
          </Alert>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="danger" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? <Spinner className="h-4 w-4" /> : null} {t("deleteButton")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
