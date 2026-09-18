import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

export type BadgeTone = "success" | "neutral" | "danger";

interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  tone?: BadgeTone;
}

// success and danger both get a hairline tinted border, neutral stays flat
// — a real status (something the badge is actively signaling) reads as a
// bordered chip, "no particular status" doesn't. This is what actually
// fixes success vs. neutral distinguishability: at bg-success/10 alone, the
// muted forest green (--color-success, unchanged) blends into the warm-tan
// neutral-200 background almost exactly (both land as pale warm-neutral
// swatches at that lightness), while the equivalent bg-danger/10 already
// reads as visibly pink/red because red survives desaturation against a
// warm palette better than green does. Bumping success's fill to /15 and
// adding the border closes that gap without touching --color-success or
// --color-danger themselves, or the neutral-200 base — still restrained
// tinted chips, not saturated pills. Text is always a distinct, translated
// label alongside the tone in every real usage (never a bare colored dot
// with no text), so this is a legibility/distinguishability fix, not a
// "color is the only signal" one.
const TONE_STYLES: Record<BadgeTone, string> = {
  success: "border border-success/40 bg-success/15 text-success",
  neutral: "bg-neutral-200 text-neutral-700",
  danger: "border border-danger/40 bg-danger/10 text-danger",
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
