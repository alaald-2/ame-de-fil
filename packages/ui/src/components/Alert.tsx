import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

type AlertTone = "info" | "success" | "danger";

interface AlertProps extends ComponentPropsWithoutRef<"div"> {
  tone?: AlertTone;
}

const TONE_STYLES: Record<AlertTone, string> = {
  info: "border-neutral-300 bg-neutral-50 text-neutral-800",
  success: "border-success/30 bg-neutral-50 text-success",
  danger: "border-danger/30 bg-neutral-50 text-danger",
};

// role differs by tone — danger interrupts (assertive "alert"), info/success
// are polite, non-interrupting announcements ("status").
export function Alert({ tone = "info", className, children, ...props }: AlertProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-sm border px-4 py-3 font-sans text-sm", TONE_STYLES[tone], className)}
      {...props}
    >
      {children}
    </div>
  );
}
