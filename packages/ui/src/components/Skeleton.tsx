import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

// A neutral pulsing block, not a spinner — DESIGN_SYSTEM.md's restraint
// extends to loading states: shape the skeleton like the real content
// (composed per-page, e.g. a table's row/column shape), not a single
// generic centered spinner that tells the user nothing about what's coming.
export function Skeleton({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-sm bg-neutral-200", className)}
      {...props}
    />
  );
}
