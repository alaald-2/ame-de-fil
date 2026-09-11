import { type ReactNode } from "react";
import { Heading } from "./Heading";
import { Text } from "./Text";
import { cn } from "../utils/cn";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

// Quiet typography, not a clipart illustration — restraint applies to empty
// states too. `action` is a slot (not a required prop) since not every
// empty state has one — Customers, for instance, has no create action to
// offer (customers register themselves).
//
// level={2}: every real usage across apps/admin renders this directly under
// a page's own <h1>, with no <h2> in between (found via axe's heading-order
// rule against a genuinely empty Categories list — the first list in this
// app whose empty state was ever actually exercised by an axe scan, since
// every other list's seed/dev data happened to always be non-empty when
// tested). If a future caller ever needs this nested under a real <h2>
// section instead, add a `headingLevel` prop rather than reverting this.
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 py-20 text-center", className)}>
      <Heading level={2}>{title}</Heading>
      {description ? <Text tone="muted" className="max-w-sm">{description}</Text> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
