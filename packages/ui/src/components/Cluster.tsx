import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

type Gap = "xs" | "sm" | "md" | "lg";
type Align = "start" | "center" | "end";

interface ClusterProps extends ComponentPropsWithoutRef<"div"> {
  gap?: Gap;
  align?: Align;
}

const GAP_STYLES: Record<Gap, string> = { xs: "gap-1", sm: "gap-2", md: "gap-4", lg: "gap-6" };
const ALIGN_STYLES: Record<Align, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
};

export function Cluster({ gap = "md", align = "center", className, ...props }: ClusterProps) {
  return (
    <div
      className={cn("flex flex-wrap", GAP_STYLES[gap], ALIGN_STYLES[align], className)}
      {...props}
    />
  );
}
