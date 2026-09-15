import { Skeleton } from "@ame-de-fil/ui";

// Shaped like the real card-list layout (TasksList) — a bucket heading
// followed by a handful of card rows, not a centered spinner.
export default function TasksLoading() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-6">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>

      <Skeleton className="mt-6 h-8 w-64" />

      <div className="mt-8 flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-sm" />
        ))}
      </div>
    </div>
  );
}
