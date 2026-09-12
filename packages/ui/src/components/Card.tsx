import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

// A hairline border, never a shadow (DESIGN_SYSTEM.md §5) — used only where
// grouping genuinely earns its keep (e.g. separating an order's summary
// totals from its line-item table), not as a default wrapper for every
// block of content. Prefer spacing/divide-y over a Card when a section
// doesn't need a visible boundary. Forwards its ref (product-images-form.tsx's
// own sortable image cards need one to hand to dnd-kit's useSortable).
export const Card = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-sm border border-neutral-200 p-6", className)} {...props} />
  ),
);
Card.displayName = "Card";
