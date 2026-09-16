"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Text, cn } from "@ame-de-fil/ui";
import { Link } from "../i18n/navigation";

export interface GalleryTile {
  id: string;
  url: string;
  altText: string | null;
  collectionSlug: string;
  collectionName: string;
}

interface CollectionsGalleryProps {
  tiles: GalleryTile[];
  label: string;
}

// Calm, not showy — a slow drift, not a ticker. Signed so the direction
// (leftward) reads clearly at the one call site below.
const DRIFT_PX_PER_SEC = 26;

// Below this, a gesture is still just a click (or a tap with a little
// finger wobble); at or beyond it, it's a real drag and the tile's own
// navigation gets suppressed on release.
const DRAG_THRESHOLD_PX = 6;

// A handful of alternating tilt/vertical-offset presets, cycled by index —
// organic-looking without being random (a real Math.random() here would
// make every server/client render disagree, and re-shuffle on every
// hydration). Small angles/offsets only (DESIGN_SYSTEM.md's restrained,
// editorial stance) — nothing as theatrical as the reference moodboard.
const TILE_OFFSETS = [
  "rotate-[-2deg] translate-y-3",
  "rotate-[1.5deg] -translate-y-4",
  "rotate-[2deg] translate-y-1",
  "rotate-[-1.5deg] -translate-y-2",
  "rotate-[1deg] translate-y-4",
  "rotate-[-2.5deg] -translate-y-1",
];

// Hand-built, same philosophy as hero-slider.tsx (no carousel library) but
// a continuous drift rather than discrete slides: one mutable offset
// (offsetRef, px) driven by requestAnimationFrame and written straight to
// the track's own style.transform, never through React state — a
// per-frame setState would re-render this whole tree 60x/sec. Looping is
// the classic doubled-track trick: the tile list is rendered twice back to
// back, and once the offset has scrolled past one copy's width, it wraps
// by exactly that width, which is seamless because the two copies are
// pixel-identical. Drag reuses the same offsetRef (so drag and the
// auto-drift are just two writers to one number, never fighting each
// other) and pauses the drift while active, matching hero-slider's own
// "pause on drag" behavior.
export function CollectionsGallery({ tiles, label }: CollectionsGalleryProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const setWidthRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  // True once a gesture has moved far enough to count as a real drag, not
  // a click with a pixel or two of natural hand jitter — a tile's release
  // point can land back on the very link the gesture started on (the whole
  // point of a drag is that things end up somewhere else visually, but the
  // DOM node itself never moves, only its transform), which would otherwise
  // fire real navigation the user never intended.
  const hasDraggedRef = useRef(false);

  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // window/matchMedia don't exist during SSR — same check as
    // hero-slider.tsx and Reveal.tsx, read once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    // Half the doubled track's rendered width = one copy's width, the
    // wrap-around period. Re-measured whenever the tile list itself
    // changes (new collection data), not on every render.
    if (trackRef.current) setWidthRef.current = trackRef.current.scrollWidth / 2;
  }, [tiles]);

  useEffect(() => {
    if (reducedMotion || tiles.length === 0) return;

    function applyTransform() {
      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(${offsetRef.current}px)`;
      }
    }

    function frame(time: number) {
      if (!isPaused && !isDragging && lastTimeRef.current !== null) {
        const deltaSec = (time - lastTimeRef.current) / 1000;
        offsetRef.current -= DRIFT_PX_PER_SEC * deltaSec;
        const width = setWidthRef.current;
        if (width > 0 && offsetRef.current <= -width) offsetRef.current += width;
        applyTransform();
      }
      lastTimeRef.current = time;
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = null;
    };
  }, [isPaused, isDragging, reducedMotion, tiles.length]);

  function normalizeOffset() {
    const width = setWidthRef.current;
    if (width <= 0) return;
    if (offsetRef.current <= -width) offsetRef.current += width;
    if (offsetRef.current > 0) offsetRef.current -= width;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (tiles.length === 0) return;
    pointerIdRef.current = event.pointerId;
    dragStartXRef.current = event.clientX;
    dragStartOffsetRef.current = offsetRef.current;
    hasDraggedRef.current = false;
    setIsDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    const deltaX = event.clientX - dragStartXRef.current;
    if (Math.abs(deltaX) >= DRAG_THRESHOLD_PX) hasDraggedRef.current = true;
    offsetRef.current = dragStartOffsetRef.current + deltaX;
    normalizeOffset();
    if (trackRef.current) trackRef.current.style.transform = `translateX(${offsetRef.current}px)`;
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    setIsDragging(false);
  }

  function handleTileClick(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (hasDraggedRef.current) event.preventDefault();
  }

  if (tiles.length === 0) return null;

  // Duplicated for the seamless loop (see the component-level comment) —
  // the second copy is aria-hidden/untabbable so keyboard and screen-reader
  // users only ever reach one real link per collection, not two.
  const doubled = [...tiles, ...tiles];

  return (
    <div
      role="region"
      aria-label={label}
      className="-mx-4 overflow-hidden py-6 sm:-mx-6 sm:py-8 lg:-mx-8"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        ref={trackRef}
        className={cn("flex w-max gap-6 px-4 will-change-transform sm:gap-8 sm:px-6 lg:px-8", isDragging && "cursor-grabbing")}
        style={{ touchAction: "pan-y" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {doubled.map((tile, index) => {
          const isDuplicate = index >= tiles.length;
          return (
            <Link
              key={`${tile.id}-${index}`}
              href={{ pathname: "/collections/[slug]", params: { slug: tile.collectionSlug } }}
              draggable={false}
              onClick={handleTileClick}
              aria-hidden={isDuplicate}
              tabIndex={isDuplicate ? -1 : undefined}
              className={cn(
                "block w-52 shrink-0 cursor-grab select-none active:cursor-grabbing sm:w-64 lg:w-72",
                TILE_OFFSETS[index % TILE_OFFSETS.length],
              )}
            >
              <div className="aspect-[4/5] overflow-hidden rounded-sm bg-neutral-100">
                <img
                  src={tile.url}
                  alt={tile.altText ?? ""}
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </div>
              <Text size="sm" className="mt-3 text-center text-neutral-900">
                {tile.collectionName}
              </Text>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
