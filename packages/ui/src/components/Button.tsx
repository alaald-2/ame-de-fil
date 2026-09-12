import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-sans text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "rounded-sm bg-accent-600 px-5 py-2.5 text-neutral-50 hover:bg-accent-700",
        secondary:
          "rounded-sm border border-neutral-300 px-5 py-2.5 text-neutral-900 hover:bg-neutral-100",
        ghost:
          "px-1 py-1 text-neutral-700 underline-offset-4 hover:text-neutral-900 hover:underline",
        // Reserved for confirming an irreversible action (permanent delete,
        // refund) — everything else, including routine status changes,
        // stays primary/secondary so this reads as a real warning, not
        // decoration. No dedicated darker --color-danger shade exists in
        // tokens.css (only the one value), so hover darkens via opacity
        // the same way Badge/Alert already do for this token.
        danger: "rounded-sm bg-danger px-5 py-2.5 text-neutral-50 hover:bg-danger/90",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

// Restrained per DESIGN_SYSTEM.md §5 — the accent color is reserved for
// primary commerce actions (Add to Cart, Checkout, Pay), not sprinkled
// across every interactive element; secondary/ghost intentionally stay neutral.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant }), className)} {...props} />;
  },
);
Button.displayName = "Button";
