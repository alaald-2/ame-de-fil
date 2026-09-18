"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Text,
  PlaceholderImage,
  Spinner,
  CheckIcon,
  Cross2Icon,
  VisuallyHidden,
  cn,
} from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";
import { useCart } from "./cart-provider";

interface AddToCartButtonProps {
  variantId: string;
  available: boolean;
  productName: string;
  image: { url: string; altText: string | null } | null;
}

// An anchored confirmation panel, not a centered/dimmed modal (design
// discussion) — the page stays fully visible and interactive behind it,
// same relative-container/absolute-panel/outside-pointerdown/Escape idiom
// already established twice in this app (header-search.tsx,
// account-menu.tsx), reused here rather than reaching for Radix Dialog
// (which is a *modal* primitive — wrong semantics for a non-blocking
// confirmation) or a new popover dependency.
export function AddToCartButton({
  variantId,
  available,
  productName,
  image,
}: AddToCartButtonProps) {
  const t = useTranslations("Cart");
  const tCommon = useTranslations("Common");
  const { addItem, cart } = useCart();
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setIsConfirmationOpen(false), []);
  const closeAndReturnFocus = useCallback(() => {
    setIsConfirmationOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isConfirmationOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsConfirmationOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeAndReturnFocus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isConfirmationOpen, closeAndReturnFocus]);

  if (!available) return null;

  async function handleClick() {
    setIsLoading(true);
    const ok = await addItem(variantId, 1);
    setIsLoading(false);
    if (ok) setIsConfirmationOpen(true);
  }

  const itemTabIndex = isConfirmationOpen ? 0 : -1;

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={buttonRef}
        type="button"
        variant="primary"
        onClick={handleClick}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? <Spinner className="h-4 w-4" /> : null} {t("addToCart")}
      </Button>

      {/* Not a Radix Dialog — no aria-modal, the page behind stays reachable
          on purpose. aria-live announces the confirmation to screen readers
          without stealing focus off the button the user just activated
          (a forced focus jump would be jarring for what's fundamentally a
          toast, not a decision the user must make); Tab from the button
          reaches this panel's own controls next in DOM order regardless. */}
      <div
        aria-live="polite"
        aria-hidden={!isConfirmationOpen}
        className={cn(
          "absolute top-full left-0 z-30 mt-4 w-full rounded-sm border border-neutral-200 bg-neutral-50 p-6 transition-all duration-200 ease-out-slow motion-reduce:transition-none",
          isConfirmationOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <CheckIcon aria-hidden="true" className="h-4 w-4 text-neutral-900" />
            <Text className="font-medium text-neutral-900">{t("addedTitle")}</Text>
          </div>
          <button
            type="button"
            onClick={closeAndReturnFocus}
            tabIndex={itemTabIndex}
            className="shrink-0 rounded-sm p-1 text-neutral-500 transition-colors duration-150 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <Cross2Icon aria-hidden="true" className="h-4 w-4" />
            <VisuallyHidden>{tCommon("close")}</VisuallyHidden>
          </button>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-sm bg-neutral-100">
            {image ? (
              <img
                src={image.url}
                alt={image.altText ?? ""}
                className="h-full w-full object-cover"
              />
            ) : (
              <PlaceholderImage className="h-full w-full" />
            )}
          </div>
          <Text className="text-neutral-900">{productName}</Text>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Button asChild variant="secondary" tabIndex={itemTabIndex} onClick={close}>
            <Link href="/cart">{t("viewCart", { count: cart.itemCount })}</Link>
          </Button>
          <Button asChild variant="primary" tabIndex={itemTabIndex} onClick={close}>
            <Link href="/checkout">{t("checkoutAction")}</Link>
          </Button>
          <button
            type="button"
            onClick={close}
            tabIndex={itemTabIndex}
            className="font-sans text-sm text-neutral-600 underline-offset-4 transition-colors duration-150 hover:text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            {t("continueShopping")}
          </button>
        </div>
      </div>
    </div>
  );
}
