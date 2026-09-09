import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

type Gap = "xs" | "sm" | "md" | "lg" | "xl";

interface StackProps extends ComponentPropsWithoutRef<"div"> {
  gap?: Gap;
}

const GAP_STYLES: Record<Gap, string> = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-10",
};

export function Stack({ gap = "md", className, ...props }: StackProps) {
  return <div className={cn("flex flex-col", GAP_STYLES[gap], className)} {...props} />;
}
