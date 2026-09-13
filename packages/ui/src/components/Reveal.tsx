"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../utils/cn";

export interface RevealProps {
  children: ReactNode;
  /** Stagger delay in ms — pass `index * 60` from a list's `.map()` to
   * cascade a group of items in one after another instead of firing them
   * all at once. */
  delay?: number;
  className?: string;
}

// Fades a section up into place the first time it scrolls into view.
// IntersectionObserver disconnects itself after the first hit — this plays
// once per element and never re-triggers on scroll-away/scroll-back
// (DESIGN_SYSTEM.md's restrained-motion stance).
//
// Reduced motion is decided here in JS, not left to a CSS override: a user
// with prefers-reduced-motion never gets the observer at all, so `.reveal`
// (opacity: 0) is never applied and there's no hidden starting frame for
// them to perceive, not even a brief one.
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // `window` doesn't exist during SSR, so this can only be read inside
      // an effect, never derived at render time the way most state is.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReducedMotion(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      // Matches roughly one section-heading's worth of lead-in — an item
      // finishes revealing shortly before it reaches eye level, rather than
      // right as it crosses the very bottom edge of the viewport.
      { rootMargin: "0px 0px -80px 0px", threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(!reducedMotion && "reveal", isVisible && "reveal--visible", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
