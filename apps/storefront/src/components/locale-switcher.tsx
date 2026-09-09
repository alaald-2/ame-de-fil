"use client";

import { useParams } from "next/navigation";
import { usePathname, Link } from "../i18n/navigation";
import { routing } from "../i18n/routing";

const LOCALE_LABELS: Record<(typeof routing.locales)[number], string> = {
  "sv-SE": "SV",
  en: "EN",
};

export function LocaleSwitcher() {
  // usePathname() returns the canonical template ("/products/[slug]") on a
  // dynamic route; useParams() supplies the actual values — next-intl's
  // typed Link needs both together to rebuild the correct localized URL
  // (a raw template string alone isn't a valid href with pathnames configured).
  const pathname = usePathname();
  const params = useParams();

  return (
    <div className="flex gap-3 font-sans text-sm text-neutral-600" aria-label="Language">
      {routing.locales.map((locale, index) => (
        <span key={locale} className="flex items-center gap-3">
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          <Link
            // A generic, works-on-any-page switcher is inherently at odds
            // with next-intl's per-route strict param typing (each
            // pathname's params type is a distinct union member) — this
            // narrow cast is a known, accepted limitation of typed
            // pathnames for exactly this component shape, not a general
            // weakening of type safety elsewhere.
            href={{ pathname, params } as unknown as Parameters<typeof Link>[0]["href"]}
            locale={locale}
            className="rounded-sm hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            {LOCALE_LABELS[locale]}
          </Link>
        </span>
      ))}
    </div>
  );
}
