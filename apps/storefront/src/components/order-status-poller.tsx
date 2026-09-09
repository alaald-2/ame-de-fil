"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Heading, Text, Button, Spinner } from "@ame-de-fil/ui";
import type { CheckoutResponse } from "@ame-de-fil/types";
import { Link } from "../i18n/navigation";
import { api } from "../lib/api-client";
import type { AppLocale } from "../lib/locale";
import { OrderConfirmation } from "./order-confirmation";

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 20_000;

type PollOutcome = "polling" | "confirmed" | "stockLost" | "canceled" | "timeout";

// The DB-authoritative source of truth (PAYMENTS.md §4) — never trusts the
// browser's own view of whether payment succeeded (requirement 7). Renders
// the order data the storefront already holds from the original checkout
// response only once this poll confirms it; the polling endpoint itself
// returns nothing but {status, payment:{status}} (DECISIONS.md ADR-024).
export function OrderStatusPoller({
  order,
  locale,
}: {
  order: CheckoutResponse;
  locale: AppLocale;
}) {
  const t = useTranslations("Checkout");
  const [outcome, setOutcome] = useState<PollOutcome>("polling");

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    // Ignored entirely for an authenticated caller — the API authorizes
    // them by session ownership instead (orders.service.ts); harmless to
    // still send.
    const token = order.orderStatusToken;

    async function poll() {
      if (cancelled) return;
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setOutcome("timeout");
        return;
      }

      const { data } = await api.GET("/api/v1/orders/{orderId}/status", {
        params: {
          path: { orderId: order.orderId },
          header: token ? { "x-order-status-token": token } : {},
        },
      });

      if (cancelled) return;

      if (data?.status === "CONFIRMED") {
        setOutcome("confirmed");
        return;
      }
      if (data?.status === "PAYMENT_SUCCEEDED_STOCK_LOST") {
        setOutcome("stockLost");
        return;
      }
      if (data?.status === "CANCELED") {
        setOutcome("canceled");
        return;
      }

      setTimeout(() => void poll(), POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [order.orderId, order.orderStatusToken]);

  if (outcome === "confirmed") {
    return <OrderConfirmation order={order} locale={locale} />;
  }

  if (outcome === "stockLost") {
    return (
      <div>
        <Heading level={1}>{t("stockLostTitle")}</Heading>
        <Text tone="muted" className="mt-3">
          {t("stockLostBody")}
        </Text>
        <Text tone="muted" className="mt-3">
          {t("orderNumber")}: {order.orderNumber}
        </Text>
      </div>
    );
  }

  if (outcome === "canceled") {
    return (
      <div>
        <Heading level={1}>{t("orderCanceledTitle")}</Heading>
        <Text tone="muted" className="mt-3">
          {t("orderCanceledBody")}
        </Text>
        <div className="mt-6">
          <Button asChild>
            <Link href="/shop">{t("retryCheckout")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (outcome === "timeout") {
    return (
      <div>
        <Heading level={1}>{t("stillConfirmingTitle")}</Heading>
        <Text tone="muted" className="mt-3">
          {t("stillConfirmingBody")}
        </Text>
        <Text tone="muted" className="mt-3">
          {t("orderNumber")}: {order.orderNumber}
        </Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <Spinner className="h-8 w-8" />
      <Heading level={1}>{t("confirmingTitle")}</Heading>
      <Text tone="muted">{t("confirmingBody")}</Text>
    </div>
  );
}
