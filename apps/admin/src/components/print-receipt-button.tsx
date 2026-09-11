"use client";

import { Button } from "@ame-de-fil/ui";

interface PrintReceiptButtonProps {
  label: string;
}

// The receipt itself lives in the same page (order-receipt.tsx, hidden via
// .print-only/.no-print — globals.css) — one click opens the print dialog
// immediately, no navigation, which is the entire point of "fast."
export function PrintReceiptButton({ label }: PrintReceiptButtonProps) {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
