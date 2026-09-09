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

const TONE_STYLES: Record<TextTone, string> = {
  default: "text-neutral-800",
  muted: "text-neutral-500",
};

export function Text({ size = "base", tone = "default", className, ...props }: TextProps) {
  return (
    <p
      className={cn("font-sans leading-relaxed", SIZE_STYLES[size], TONE_STYLES[tone], className)}
      {...props}
    />
  );
}
