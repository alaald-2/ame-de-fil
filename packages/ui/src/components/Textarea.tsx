import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../utils/cn";

const FIELD_STYLES =
  "w-full rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-base text-neutral-900 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(FIELD_STYLES, "min-h-24", className)} {...props} />
));
Textarea.displayName = "Textarea";
