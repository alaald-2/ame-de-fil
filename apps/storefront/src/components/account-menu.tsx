"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  PersonIcon,
  ArchiveIcon,
  HomeIcon,
  ExitIcon,
  VisuallyHidden,
  Text,
  cn,
} from "@ame-de-fil/ui";
import { Link, useRouter } from "../i18n/navigation";
import { api } from "../lib/api-client";
import { readCsrfCookie } from "../lib/csrf";
import { useCart } from "./cart-provider";

interface AccountMenuProps {
  // null for a signed-out visitor — same signal shape header.tsx already
  // gets from getCurrentUser(), just passed through instead of re-fetched.
  displayName: string | null;
  email: string | null;
}

// Same toggle/outside-click/Escape idiom as header-search.tsx's panel
// (mirrored deliberately, not reinvented) — an always-mounted panel whose
// opacity/translate transitions, gated by pointer-events/aria-hidden so a
// closed panel is never reachable by pointer, keyboard, or screen reader.
export function AccountMenu({ displayName, email }: AccountMenuProps) {
  const t = useTranslations("Navigation");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const { refresh: refreshCart } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setIsOpen(false), []);
  const closeAndReturnFocus = useCallback(() => {
    setIsOpen(false);
    toggleButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
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
  }, [isOpen, closeAndReturnFocus]);

  // Mirrors sign-out-button.tsx's handleSignOut exactly (same endpoint,
  // same cart-refresh-after-sign-out reasoning) — not extracted to a shared
  // hook since the two call sites' surrounding error/loading UI genuinely
  // differ (a full alert+button there, a quiet disabled row here).
  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      const { error } = await api.POST("/api/v1/auth/logout", {
        headers: { "x-csrf-token": readCsrfCookie() },
      });
      if (error) return;
      void refreshCart();
      close();
      router.push("/");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  const itemTabIndex = isOpen ? 0 : -1;
  const itemClassName =
    "flex items-center gap-3 px-4 py-2.5 font-sans text-sm text-neutral-700 transition-colors duration-150 ease-out-slow hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:bg-neutral-100";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={toggleButtonRef}
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="rounded-sm p-1.5 text-neutral-700 transition-colors duration-200 ease-out-slow hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <PersonIcon aria-hidden="true" className="h-5 w-5" />
        <VisuallyHidden>{t("account")}</VisuallyHidden>
      </button>
      <div
        aria-hidden={!isOpen}
        className={cn(
          "absolute top-full right-0 z-30 mt-4 w-60 origin-top-right rounded-sm border border-neutral-200 bg-neutral-50 py-2 shadow-lg transition-all duration-200 ease-out-slow",
          isOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        {displayName ? (
          <>
            <div className="border-b border-neutral-200 px-4 pb-3">
              <Text size="sm" className="truncate font-medium text-neutral-900">
                {displayName}
              </Text>
              {/* Skipped when displayName already IS the email — the
                  no-first/last-name fallback in header.tsx — so a customer
                  with no name on file never sees the same email twice. */}
              {email && email !== displayName ? (
                <Text size="sm" tone="muted" className="truncate">
                  {email}
                </Text>
              ) : null}
            </div>
            <Link href="/account" tabIndex={itemTabIndex} onClick={close} className={itemClassName}>
              <PersonIcon aria-hidden="true" className="h-4 w-4 text-neutral-400" />
              {t("account")}
            </Link>
            <Link
              href="/account/orders"
              tabIndex={itemTabIndex}
              onClick={close}
              className={itemClassName}
            >
              <ArchiveIcon aria-hidden="true" className="h-4 w-4 text-neutral-400" />
              {t("myOrders")}
            </Link>
            <Link
              href="/account/addresses"
              tabIndex={itemTabIndex}
              onClick={close}
              className={itemClassName}
            >
              <HomeIcon aria-hidden="true" className="h-4 w-4 text-neutral-400" />
              {t("addresses")}
            </Link>
            <div className="mt-1 border-t border-neutral-200 pt-1">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                tabIndex={itemTabIndex}
                className={cn("w-full text-left disabled:opacity-60", itemClassName)}
              >
                <ExitIcon aria-hidden="true" className="h-4 w-4 text-neutral-400" />
                {tCommon("signOut")}
              </button>
            </div>
          </>
        ) : (
          <Link href="/login" tabIndex={itemTabIndex} onClick={close} className={itemClassName}>
            <PersonIcon aria-hidden="true" className="h-4 w-4 text-neutral-400" />
            {t("signIn")}
          </Link>
        )}
      </div>
    </div>
  );
}
