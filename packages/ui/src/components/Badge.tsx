import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

type BadgeTone = "success" | "neutral" | "danger";

interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  tone?: BadgeTone;
}

const TONE_STYLES: Record<BadgeTone, string> = {
  success: "bg-success/10 text-success",
  neutral: "bg-neutral-200 text-neutral-700",
  danger: "bg-danger/10 text-danger",
};

// A quiet tinted label, not a saturated pill — status is information, not
// decoration. `danger` uses the existing --color-danger token (Orders'
// canceled/failed states are its first real consumer) — still no
// `warning` tone until a genuine consumer needs one (DECISIONS.md's token
// review left --color-warning deferred, and that decision is untouched
// here: this reuses an existing token, it doesn't add one).
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
