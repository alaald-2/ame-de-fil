"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";
import { VisuallyHidden } from "./VisuallyHidden";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

interface DialogContentProps extends ComponentPropsWithoutRef<typeof RadixDialog.Content> {
  title: string;
  description?: string;
  /** Accessible label for the close button — packages/ui has no i18n
   * dependency (same reasoning as NavLink/Pagination's own label props),
   * so the caller supplies its own translated string. */
  closeLabel: string;
}

// A thin hairline border, not a heavy shadow (DESIGN_SYSTEM.md §5) — the
// overlay dim alone separates this from the page behind it. Open/close
// motion is a restrained ~150ms opacity+scale, driven entirely by Radix's
// own `data-state` attribute and the `animate-dialog-*`/`animate-overlay-*`
// keyframes in tokens.css — no animation library dependency. Title is
// mandatory (Radix's own accessibility requirement); pass `description`
// when there's real supporting copy to read alongside it.
//
// max-h-[85vh] + overflow-y-auto: every dialog before create-taxonomy-dialog.tsx
// was short enough to always fit a normal viewport, so this never mattered.
// A dialog with two full per-locale translation fieldsets is taller than a
// typical viewport — without a scroll boundary, its own submit button
// rendered past the viewport edge with nothing to scroll (the dialog itself
// is `fixed`-positioned, so page-level scroll can't reach it either),
// making the form unusable. This bounds every dialog's content the same
// way regardless of length, rather than special-casing the tall one.
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
      <RadixDialog.Overlay className="fixed inset-0 bg-neutral-900/40 data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
      <RadixDialog.Content
        className={cn(
          "fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-sm border border-neutral-200 bg-neutral-50 p-6 focus:outline-none data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in",
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

interface DrawerContentProps extends ComponentPropsWithoutRef<typeof RadixDialog.Content> {
  title: string;
}

// A full-viewport panel sliding in from the left (animate-drawer-in/out,
// tokens.css) instead of DialogContent's centered card — the storefront's
// mobile nav (site-nav.tsx's MobileNav, its only caller) wants a
// menu-dominates-the-screen editorial feel, not a narrow form-sized modal
// or an inset sidebar. Built as its own variant here rather than exposed as
// a `position` prop on DialogContent: the two share no layout classes at
// all (fixed corner vs. centered, full-viewport vs. max-h-[85vh]), so
// branching one component on a prop would just be an if/else in disguise.
//
// No built-in close button (unlike DialogContent) — the mobile nav's own
// header row interleaves the close icon with its logo and search/cart
// icons in a specific order DrawerContent has no reason to know about, so
// the caller composes its own header using `DialogClose` and puts it in
// `children` instead. Title is always visually hidden — a drawer's own
// content (e.g. a nav list) is the visible heading equivalent, and the
// caller only needs the accessible name Radix requires.
//
// bg-neutral-50/95 + backdrop-blur-sm (rather than a fully opaque panel):
// the page behind should stay faintly perceptible through the panel itself
// per the design brief, since the panel covers the entire viewport and
// leaves the dimmed RadixDialog.Overlay almost nothing to show on its own.
export function DrawerContent({ title, className, children, ...props }: DrawerContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-neutral-900/15 data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
      <RadixDialog.Content
        className={cn(
          "fixed inset-0 z-50 flex h-dvh w-screen flex-col overflow-y-auto bg-neutral-50/95 backdrop-blur-sm focus:outline-none data-[state=closed]:animate-drawer-out data-[state=open]:animate-drawer-in",
          className,
        )}
        {...props}
      >
        <VisuallyHidden asChild>
          <RadixDialog.Title>{title}</RadixDialog.Title>
        </VisuallyHidden>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
