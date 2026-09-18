import type { BadgeTone } from "@ame-de-fil/ui";

export type TaskBucket = "overdue" | "dueToday" | "dueTomorrow" | "upcoming" | "noDueDate";

const DAY_MS = 86_400_000;

// UTC calendar-day boundaries, not the viewer's browser-local day — this
// page is a Next.js Server Component (same rendering model as every other
// admin list page), which has no access to the browser's timezone. Given
// this project is Sweden-only (ADR-021, UTC+1/+2), the practical drift
// versus a true browser-local "today" is at most a couple of hours near
// midnight — disclosed here rather than silently assumed perfect, the same
// posture PAYMENTS.md/ROADMAP.md use for every other known limitation in
// this codebase.
export function taskBucket(dueAt: string | null, now: Date): TaskBucket {
  if (!dueAt) return "noDueDate";

  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const due = new Date(dueAt).getTime();

  if (due < startOfToday) return "overdue";
  if (due < startOfToday + DAY_MS) return "dueToday";
  if (due < startOfToday + 2 * DAY_MS) return "dueTomorrow";
  return "upcoming";
}

export function taskBucketTone(bucket: TaskBucket): BadgeTone {
  switch (bucket) {
    case "overdue":
      return "danger";
    case "dueToday":
    case "dueTomorrow":
      return "neutral";
    default:
      return "neutral";
  }
}

export function taskStatusTone(status: string): BadgeTone {
  switch (status) {
    case "DONE":
      return "success";
    case "CANCELED":
      return "neutral";
    default:
      return "neutral";
  }
}
