"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlaceholderImage, cn } from "@ame-de-fil/ui";

interface GalleryImage {
  url: string;
  altText: string | null;
}

interface ProductGalleryProps {
  images: GalleryImage[];
}

// A thumbnail strip only appears once there's more than one real image to
// switch between — most products today have zero or one (catalog
// photography still pending, DECISIONS.md ADR-020), so this renders exactly
// like the old single static <img> until that changes, and scales up to a
// real gallery the moment a product gets more photos, with no layout change
// needed on either end.
export function ProductGallery({ images }: ProductGalleryProps) {
  const t = useTranslations("Product");
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex];

  return (
    <div className="flex flex-col gap-3">
      <div className="group aspect-[3/4] w-full overflow-hidden bg-neutral-100">
        {active ? (
          // `key` forces a remount on every swap, which restarts the
          // `animate-fade-in` keyframe — a crossfade between images with no
          // extra transition state to track (tokens.css's own reasoning for
          // using a real animation over a transition here).
          <img
            key={active.url}
            src={active.url}
            alt={active.altText ?? ""}
            className="h-full w-full animate-fade-in object-cover transition-transform duration-500 ease-out-slow group-hover:scale-[1.03]"
          />
        ) : (
          <PlaceholderImage className="h-full w-full" />
        )}
      </div>
      {images.length > 1 ? (
        <div className="flex gap-2">
          {images.map((image, index) => (
            <button
              key={image.url + index}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-current={index === activeIndex}
              aria-label={t("viewImage", { number: index + 1 })}
              className={cn(
                "h-16 w-12 shrink-0 overflow-hidden border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
                index === activeIndex
                  ? "border-neutral-900"
                  : "border-transparent hover:border-neutral-300",
              )}
            >
              <img src={image.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
