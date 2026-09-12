import { type ComponentPropsWithoutRef } from "react";
import { ImageIcon } from "@radix-ui/react-icons";
import { cn } from "../utils/cn";

// Stands in for a real product/lifestyle photo wherever the catalog hasn't
// been photographed yet (storefront's own DECISIONS.md ADR-020: image
// storage vendor still deferred, so most products have no real image today).
// A soft warm gradient + a single muted glyph — legible as "photo coming
// soon", never a broken-image look or a fake screenshot — so callers can
// build real layouts now and swap in `<img>` later without touching the
// surrounding markup. The caller controls sizing/aspect ratio entirely via
// `className` (e.g. `aspect-[3/4] w-full`), same as every real `<img>` this
// replaces.
export function PlaceholderImage({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200",
        className,
      )}
      {...props}
    >
      <ImageIcon className="h-8 w-8 text-neutral-400" />
    </div>
  );
}
