import type { BadgeTone } from "@ame-de-fil/ui";

// Only two real values exist on User.status (ACTIVE/DISABLED) — mirrors
// CustomersTable's own inline ternary, pulled out here since Administration
// needs the same mapping in three places (list, detail, dialogs).
export function userStatusTone(status: string): BadgeTone {
  return status === "ACTIVE" ? "success" : "neutral";
}
