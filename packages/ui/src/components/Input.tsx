import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../utils/cn";

const FIELD_STYLES =
  "w-full rounded-sm border border-neutral-300 bg-neutral-50 px-3 py-2 font-sans text-base text-neutral-900 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(FIELD_STYLES, className)} {...props} />
  ),
);
Input.displayName = "Input";
