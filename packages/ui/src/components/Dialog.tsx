"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";
import { VisuallyHidden } from "./VisuallyHidden";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;

interface DialogContentProps extends ComponentPropsWithoutRef<typeof RadixDialog.Content> {
  title: string;
  description?: string;
  /** Accessible label for the close button — packages/ui has no i18n
   * dependency (same reasoning as NavLink/Pagination's own label props),
   * so the caller supplies its own translated string. */
  closeLabel: string;
}

// A thin hairline border, not a heavy shadow (DESIGN_SYSTEM.md §5) — the
// overlay dim alone separates this from the page behind it. No open/close
// transition: `motion` is deliberately not installed this checkpoint (no
// real consumer needed it before now), and an abrupt but instant dialog is
// preferable to inventing unapproved Tailwind animation utilities. Title is
// mandatory (Radix's own accessibility requirement); pass `description`
// when there's real supporting copy to read alongside it.
export function DialogContent({
  title,
  description,
  closeLabel,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 bg-neutral-900/40" />
      <RadixDialog.Content
        className={cn(
          "fixed top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-sm border border-neutral-200 bg-neutral-50 p-6 focus:outline-none",
          className,
        )}
        {...props}
      >
        <RadixDialog.Title className="font-display text-xl text-neutral-900">{title}</RadixDialog.Title>
        {description ? (
          <RadixDialog.Description className="mt-1 text-sm text-neutral-600">
            {description}
          </RadixDialog.Description>
        ) : null}
        <div className="mt-6">{children}</div>
        <RadixDialog.Close className="absolute top-4 right-4 rounded-sm p-1 text-neutral-500 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
          <Cross2Icon aria-hidden="true" className="h-4 w-4" />
          <VisuallyHidden>{closeLabel}</VisuallyHidden>
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
