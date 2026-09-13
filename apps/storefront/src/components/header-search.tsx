"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { MagnifyingGlassIcon, Cross2Icon, VisuallyHidden, cn } from "@ame-de-fil/ui";
import { useRouter } from "../i18n/navigation";

// A header-wide icon toggle rather than an inline-expanding input: the
// header's main row is a 3-column grid (search | centered logo | icons) —
// growing an input in place would shift the logo off-center on every
// keystroke's worth of layout. The panel is always mounted (not
// conditionally rendered) so opacity/translate can transition on both open
// and close; only `pointer-events` and `aria-hidden` gate real interaction
// while it's visually collapsed.
export function HeaderSearch({ align = "left" }: { align?: "left" | "right" }) {
  const t = useTranslations("Shop");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    setIsOpen(false);
    router.push(trimmed ? { pathname: "/shop", query: { q: trimmed } } : { pathname: "/shop" });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="rounded-sm p-1 text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <MagnifyingGlassIcon aria-hidden="true" className="h-5 w-5" />
        <VisuallyHidden>{tCommon("search")}</VisuallyHidden>
      </button>
      <form
        role="search"
        onSubmit={handleSubmit}
        aria-hidden={!isOpen}
        className={cn(
          "absolute top-full z-30 mt-3 w-[min(80vw,20rem)] rounded-sm border border-neutral-200 bg-neutral-50 p-2 shadow-sm transition-all duration-200 ease-out-slow",
          align === "left" ? "left-0 origin-top-left" : "right-0 origin-top-right",
          isOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <div className="flex items-center gap-2">
          <MagnifyingGlassIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-neutral-500" />
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            tabIndex={isOpen ? 0 : -1}
            className="w-full bg-transparent font-sans text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            tabIndex={isOpen ? 0 : -1}
            className="shrink-0 rounded-sm p-1 text-neutral-500 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <Cross2Icon aria-hidden="true" className="h-3.5 w-3.5" />
            <VisuallyHidden>{tCommon("close")}</VisuallyHidden>
          </button>
        </div>
      </form>
    </div>
  );
}
