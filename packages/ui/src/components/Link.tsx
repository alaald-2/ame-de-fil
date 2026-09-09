import NextLink from "next/link";
import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

type LinkProps = ComponentPropsWithoutRef<typeof NextLink>;

export function Link({ className, ...props }: LinkProps) {
  return (
    <NextLink
      className={cn(
        "rounded-sm text-accent-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
        className,
      )}
      {...props}
    />
  );
}
