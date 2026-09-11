"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type AdminLocale } from "../i18n/config";
import { setLocaleCookie } from "../lib/locale-cookie";

interface LanguageSwitcherProps {
  className?: string;
}

// Reuses the existing cookie-based i18n architecture (apps/admin/src/i18n/
// config.ts + request.ts) rather than a second mechanism — this is only
// the write side plus the UI, not a new way of resolving locale. Works
// identically before and after authentication: the login page and the
// authenticated shell both render this same component, since both read
// the same admin_locale cookie through the same next-intl request config.
// router.refresh() re-runs Server Components (including the root layout's
// own getMessages() call) against the newly-set cookie without a full
// page reload, so in-progress form state (e.g. a half-typed password)
// survives the switch.
export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const t = useTranslations("Common");
  const activeLocale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingLocale, setPendingLocale] = useState<AdminLocale | null>(null);

  function handleSelect(locale: AdminLocale) {
    if (locale === activeLocale) return;
    setLocaleCookie(locale);
    setPendingLocale(locale);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t("languageSwitcherLabel")}
      className={`flex items-center gap-3 font-sans text-sm ${className ?? ""}`}
    >
      {SUPPORTED_LOCALES.map((locale) => {
        const isActive = locale === (isPending ? (pendingLocale ?? activeLocale) : activeLocale);
        return (
          <button
            key={locale}
            type="button"
            onClick={() => handleSelect(locale)}
            aria-pressed={isActive}
            disabled={isPending && isActive}
            className={
              isActive
                ? "font-medium text-neutral-900 underline decoration-accent-500 underline-offset-4"
                : "text-neutral-600 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-sm"
            }
          >
            {LOCALE_LABELS[locale]}
          </button>
        );
      })}
    </div>
  );
}
