"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { Button, ChevronLeftIcon, ChevronRightIcon, VisuallyHidden, cn } from "@ame-de-fil/ui";

export interface HeroSlide {
  id: string;
  imageUrl: string;
  ctaLabel: string | null;
  ctaHref: string | null;
}

interface HeroSliderProps {
  slides: HeroSlide[];
}

const AUTOPLAY_MS = 6000;
// Fraction of the container's own width a drag has to cross before it
// commits to the next/previous slide instead of snapping back — a fixed
// pixel threshold would make the gesture feel wrong at very different
// viewport widths (a phone vs. a wide desktop window).
const COMMIT_THRESHOLD_RATIO = 0.15;

// A full-bleed, admin-managed hero slider — home page.tsx only renders this
// once at least one active HeroSlide exists (see that file's own comment);
// with zero slides the homepage keeps its static single-image hero instead,
// so this component never has to handle an empty list.
//
// No carousel library: swipe is plain pointer events (covers touch and
// mouse-drag alike) tracking one `dragOffsetPx` during the gesture, autoplay
// is a single setInterval paused on hover/drag/reduced-motion, and looping
// is `% slides.length` — the whole thing is arithmetic on one `index`
// state, not a library's worth of surface area for something this small.
export function HeroSlider({ slides }: HeroSliderProps) {
  const t = useTranslations("Common");
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    // `window` doesn't exist during SSR, so this can only be read inside an
    // effect, never derived at render time — same reasoning as Reveal.tsx's
    // own identical check.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (isPaused || reducedMotion || slides.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [isPaused, reducedMotion, slides.length]);

  function wrap(next: number): number {
    return ((next % slides.length) + slides.length) % slides.length;
  }

  function goTo(next: number) {
    setIndex(wrap(next));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (slides.length <= 1) return;
    pointerIdRef.current = event.pointerId;
    dragStartXRef.current = event.clientX;
    setIsDragging(true);
    setIsPaused(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    setDragOffsetPx(event.clientX - dragStartXRef.current);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    const width = containerRef.current?.offsetWidth ?? 1;
    const offset = dragOffsetPx;
    if (Math.abs(offset) > width * COMMIT_THRESHOLD_RATIO) {
      // Functional update, not `goTo(index + delta)` — this handler is
      // recreated every render with that render's `index`, but reaching
      // for the always-current value via the updater form removes any
      // dependence on exactly when React re-renders relative to this
      // native pointerup, the same reasoning the autoplay effect's own
      // `setIndex((current) => ...)` already follows.
      setIndex((current) => wrap(current + (offset < 0 ? 1 : -1)));
    }
    setDragOffsetPx(0);
    setIsDragging(false);
    setIsPaused(false);
  }

  const active = slides[index];
  // page.tsx only ever mounts this with a non-empty list — this is just
  // satisfying noUncheckedIndexedAccess, not a real empty-list case.
  if (!active) return null;

  return (
    <div
      ref={containerRef}
      className="group relative aspect-[4/5] w-full overflow-hidden sm:aspect-[16/9] lg:aspect-[21/9]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Pointer/drag handlers live on the track itself, not the outer
          container — the arrows/dots/CTA below are the outer container's
          other children, and a pointerdown starting on one of *them* would
          otherwise bubble into these same handlers (they're all descendants
          of the same ancestor otherwise), corrupting a plain click with
          drag state it was never part of. Scoping to the track means only
          a gesture that actually starts on the image can ever be a drag. */}
      <div
        className={cn(
          "flex h-full",
          !isDragging &&
            "transition-transform duration-500 ease-out-slow motion-reduce:transition-none",
        )}
        style={{
          transform: `translateX(calc(${-index * 100}% + ${dragOffsetPx}px))`,
          touchAction: "pan-y",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {slides.map((slide) => (
          <div key={slide.id} className="relative h-full w-full shrink-0">
            <img
              src={slide.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {active.ctaLabel && active.ctaHref ? (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-neutral-900/15 to-transparent pb-10 sm:pb-14">
          <Button asChild className="pointer-events-auto">
            <a href={active.ctaHref}>{active.ctaLabel}</a>
          </Button>
        </div>
      ) : null}

      {slides.length > 1 ? (
        <>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-neutral-50/80 p-2 text-neutral-900 opacity-0 transition-opacity duration-300 ease-out-slow group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:opacity-70"
          >
            <ChevronLeftIcon aria-hidden="true" className="h-5 w-5" />
            <VisuallyHidden>{t("previousSlide")}</VisuallyHidden>
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-neutral-50/80 p-2 text-neutral-900 opacity-0 transition-opacity duration-300 ease-out-slow group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:opacity-70"
          >
            <ChevronRightIcon aria-hidden="true" className="h-5 w-5" />
            <VisuallyHidden>{t("nextSlide")}</VisuallyHidden>
          </button>

          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {slides.map((slide, slideIndex) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => goTo(slideIndex)}
                aria-current={slideIndex === index}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300 ease-out-slow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
                  slideIndex === index
                    ? "w-6 bg-neutral-50"
                    : "w-1.5 bg-neutral-50/60 hover:bg-neutral-50/80",
                )}
              >
                <VisuallyHidden>{t("goToSlide", { number: slideIndex + 1 })}</VisuallyHidden>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
