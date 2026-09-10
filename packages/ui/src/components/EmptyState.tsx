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
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 py-20 text-center", className)}>
      <Heading level={3}>{title}</Heading>
      {description ? (
        // neutral-600, not tone="muted" (neutral-500 fails AA contrast at
        // 3.78:1 against neutral-50 — tracked separately, see Table.tsx).
        <Text className="max-w-sm text-neutral-600">{description}</Text>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
