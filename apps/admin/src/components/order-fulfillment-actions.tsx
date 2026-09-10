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
  Spinner,
} from "@ame-de-fil/ui";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import { canMarkReadyToShip, canMarkShipped, canMarkDelivered } from "../lib/order-status";

interface OrderFulfillmentActionsProps {
  orderId: string;
  status: string;
}

type ActionErrorKind = "conflict" | "generic" | null;

// Exactly one action ever applies for a given status — the backend's own
// state machine (admin-orders.service.ts) only ever accepts one predecessor
// set per transition — so this renders at most one control, never a row of
// buttons only one of which would actually succeed.
export function OrderFulfillmentActions({ orderId, status }: OrderFulfillmentActionsProps) {
  const t = useTranslations("Orders.fulfillment");
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<ActionErrorKind>(null);
  const [isShipDialogOpen, setIsShipDialogOpen] = useState(false);
  const [carrierName, setCarrierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  const errorAlert = errorKind ? (
    <Alert tone="danger" className="mb-3">
      {errorKind === "conflict" ? t("conflictError") : t("genericError")}
    </Alert>
  ) : null;

  async function handleReadyToShip() {
    setErrorKind(null);
    setIsSubmitting(true);
    const { error, response } = await api.POST("/api/v1/admin/orders/{orderId}/ready-to-ship", {
      params: { path: { orderId } },
      headers: { "x-csrf-token": readCsrfCookie() },
    });
    setIsSubmitting(false);
    if (error) {
      setErrorKind(response.status === 409 ? "conflict" : "generic");
      return;
    }
    router.refresh();
  }

  async function handleDeliver() {
    setErrorKind(null);
    setIsSubmitting(true);
    const { error, response } = await api.POST("/api/v1/admin/orders/{orderId}/deliver", {
      params: { path: { orderId } },
      headers: { "x-csrf-token": readCsrfCookie() },
    });
    setIsSubmitting(false);
    if (error) {
      setErrorKind(response.status === 409 ? "conflict" : "generic");
      return;
    }
    router.refresh();
  }

  async function handleShip(event: FormEvent) {
    event.preventDefault();
    setErrorKind(null);
    setIsSubmitting(true);
    const { error, response } = await api.POST("/api/v1/admin/orders/{orderId}/ship", {
      params: { path: { orderId } },
      headers: { "x-csrf-token": readCsrfCookie() },
      body: {
        carrierName: carrierName || undefined,
        trackingNumber: trackingNumber || undefined,
        trackingUrl: trackingUrl || undefined,
      },
    });
    setIsSubmitting(false);
    if (error) {
      setErrorKind(response.status === 409 ? "conflict" : "generic");
      return;
    }
    setIsShipDialogOpen(false);
    router.refresh();
  }

  if (canMarkReadyToShip(status)) {
    return (
      <div>
        {errorAlert}
        <Button onClick={handleReadyToShip} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner className="h-4 w-4" /> {t("working")}
            </>
          ) : (
            t("markReadyToShip")
          )}
        </Button>
      </div>
    );
  }

  if (canMarkShipped(status)) {
    return (
      <div>
        <Dialog
          open={isShipDialogOpen}
          onOpenChange={(open) => {
            setIsShipDialogOpen(open);
            if (!open) setErrorKind(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>{t("markShipped")}</Button>
          </DialogTrigger>
          <DialogContent
            title={t("shipDialogTitle")}
            description={t("shipDialogDescription")}
            closeLabel={t("close")}
          >
            <form onSubmit={handleShip}>
              <div className="flex flex-col gap-4">
                {errorAlert}
                <FormField label={t("carrierNameLabel")}>
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      value={carrierName}
                      onChange={(e) => setCarrierName(e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label={t("trackingNumberLabel")}>
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label={t("trackingUrlLabel")}>
                  {(fieldProps) => (
                    <Input
                      {...fieldProps}
                      type="url"
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                    />
                  )}
                </FormField>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Spinner className="h-4 w-4" /> {t("working")}
                    </>
                  ) : (
                    t("confirm")
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (canMarkDelivered(status)) {
    return (
      <div>
        {errorAlert}
        <Button onClick={handleDeliver} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner className="h-4 w-4" /> {t("working")}
            </>
          ) : (
            t("markDelivered")
          )}
        </Button>
      </div>
    );
  }

  return null;
}
