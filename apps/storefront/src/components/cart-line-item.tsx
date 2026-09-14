"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { CartItem } from "@ame-de-fil/types";
import { Text, Input, Button } from "@ame-de-fil/ui";
import { formatMoney } from "../lib/format-money";
import type { AppLocale } from "../lib/locale";
import { useCart } from "./cart-provider";
import { SalePrice } from "./sale-price";

const COMMIT_DEBOUNCE_MS = 400;

export function CartLineItem({ item, locale }: { item: CartItem; locale: AppLocale }) {
  const t = useTranslations("Cart");
  const tShop = useTranslations("Shop");
  const { updateQuantity, removeItem } = useCart();
  const [pending, setPending] = useState(false);
  const [quantityInput, setQuantityInput] = useState(String(item.quantity));
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resyncs the field to the server's own quantity whenever it changes for a
  // reason other than this input's own edit — e.g. a stock limit clamped the
  // submitted value, or another tab changed the same cart. Skipped while a
  // commit is scheduled/in flight (commitTimeoutRef only clears once the
  // request for the CURRENT edit has been sent) so the user's own keystrokes
  // are never overwritten mid-edit; once that request resolves, `item.quantity`
  // updates and this effect corrects the field to whatever the server actually
  // accepted, which previously never happened at all (the field was
  // `defaultValue`-only, so it kept showing a stale, possibly-wrong number).
  useEffect(() => {
    if (commitTimeoutRef.current === null) {
      setQuantityInput(String(item.quantity));
    }
  }, [item.quantity]);

  useEffect(() => {
    return () => {
      if (commitTimeoutRef.current !== null) clearTimeout(commitTimeoutRef.current);
    };
  }, []);

  function commit(value: string) {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 1) return;
    setPending(true);
    void updateQuantity(item.id, quantity).finally(() => setPending(false));
  }

  // Debounced on every change (not just on blur) — a native number input's
  // spinner arrows fire `change` without blurring the field, so a
  // blur-only commit (the previous behavior) left the price/total visibly
  // stale until the user clicked elsewhere.
  function scheduleCommit(value: string) {
    if (commitTimeoutRef.current !== null) clearTimeout(commitTimeoutRef.current);
    commitTimeoutRef.current = setTimeout(() => {
      commitTimeoutRef.current = null;
      commit(value);
    }, COMMIT_DEBOUNCE_MS);
  }

  function flushCommit() {
    if (commitTimeoutRef.current !== null) {
      clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = null;
      commit(quantityInput);
    }
  }

  async function handleRemove() {
    setPending(true);
    await removeItem(item.id);
    setPending(false);
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-200 py-4">
      <div>
        <Text>{item.productName}</Text>
        <SalePrice
          price={item.unitPrice}
          originalPrice={item.originalUnitPrice}
          promotion={item.promotion}
          locale={locale}
        />
        {!item.available ? (
          <Text size="sm" tone="muted">
            {tShop("soldOut")}
          </Text>
        ) : item.availableQuantity !== null && item.quantity > item.availableQuantity ? (
          <Text size="sm" tone="muted">
            {t("onlyAvailable", { count: item.availableQuantity })}
          </Text>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <label className="sr-only" htmlFor={`quantity-${item.id}`}>
          {t("quantity")}
        </label>
        <Input
          id={`quantity-${item.id}`}
          type="number"
          min={1}
          max={99}
          value={quantityInput}
          disabled={pending}
          onChange={(e) => {
            setQuantityInput(e.target.value);
            scheduleCommit(e.target.value);
          }}
          onBlur={flushCommit}
          className="w-16 text-center"
        />
        <Text className="w-24 text-right">{formatMoney(item.lineTotal.amountMinor, locale)}</Text>
        <Button type="button" variant="ghost" onClick={handleRemove} disabled={pending}>
          {t("remove")}
        </Button>
      </div>
    </div>
  );
}
