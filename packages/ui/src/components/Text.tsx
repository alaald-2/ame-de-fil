import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

type TextSize = "sm" | "base" | "lg";
type TextTone = "default" | "muted";

interface TextProps extends ComponentPropsWithoutRef<"p"> {
  size?: TextSize;
  tone?: TextTone;
}

const SIZE_STYLES: Record<TextSize, string> = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
};

// muted uses neutral-600, not neutral-500 — neutral-500 on the neutral-50
// page background is a 3.78:1 contrast ratio, below the 4.5:1 WCAG AA
// minimum for normal text (DESIGN_SYSTEM.md §7). neutral-600 passes AA
// (5.98:1) at the same quiet weight. Every consumer of this tone gets the
// fix for free; don't reintroduce neutral-500 here or re-add a local
// `className="text-neutral-600"` override elsewhere to work around it.
const TONE_STYLES: Record<TextTone, string> = {
  default: "text-neutral-800",
  muted: "text-neutral-600",
};

export function Text({ size = "base", tone = "default", className, ...props }: TextProps) {
  return (
    <p
      className={cn("font-sans leading-relaxed", SIZE_STYLES[size], TONE_STYLES[tone], className)}
      {...props}
    />
  );
}
