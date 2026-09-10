import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

type BadgeTone = "success" | "neutral";

interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  tone?: BadgeTone;
}

const TONE_STYLES: Record<BadgeTone, string> = {
  success: "bg-success/10 text-success",
  neutral: "bg-neutral-200 text-neutral-700",
};

// A quiet tinted label, not a saturated pill — status is information, not
// decoration. Only two tones exist because only two real states
// (active/disabled) have needed one so far; add a tone when a real one does,
// not speculatively (no `warning`/`danger` tone until a genuine consumer
// needs it — DECISIONS.md's token review left `--color-warning` deferred).
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 font-sans text-xs font-medium",
        TONE_STYLES[tone],
        className,
      )}
      {...props}
    />
  );
}
