import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

type HeadingLevel = 1 | 2 | 3 | 4;

interface HeadingProps extends ComponentPropsWithoutRef<"h1"> {
  level: HeadingLevel;
}

const HEADING_STYLES: Record<HeadingLevel, string> = {
  1: "font-display text-3xl md:text-4xl font-normal tracking-tight text-neutral-900",
  2: "font-display text-2xl md:text-3xl font-normal tracking-tight text-neutral-900",
  3: "font-display text-xl md:text-2xl font-normal text-neutral-900",
  4: "font-sans text-lg font-medium text-neutral-900",
};

// Editorial display serif for headlines (DESIGN_SYSTEM.md §2) — never
// bolded-and-shouty. `level` sets both the semantic tag and the visual
// scale; kept as one prop deliberately for this foundation, not split into
// separate semantic/visual props until a real case needs that divergence.
export function Heading({ level, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as const;
  return <Tag className={cn(HEADING_STYLES[level], className)} {...props} />;
}
