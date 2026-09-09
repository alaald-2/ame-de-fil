import * as RadixLabel from "@radix-ui/react-label";
import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

export function Label({ className, ...props }: ComponentPropsWithoutRef<typeof RadixLabel.Root>) {
  return (
    <RadixLabel.Root
      className={cn("font-sans text-sm font-medium text-neutral-800", className)}
      {...props}
    />
  );
}
