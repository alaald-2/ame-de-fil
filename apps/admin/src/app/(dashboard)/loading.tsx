import { Skeleton } from "@ame-de-fil/ui";

// Only applies to "/" itself — customers/orders each have their own more
// specific loading.tsx overriding this for their own subtree. Shaped like
// the dashboard's own label-over-number stat pattern, not a spinner.
export default function DashboardLoading() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-6">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="mt-2 h-3 w-48" />

      <Skeleton className="mt-6 h-10 w-full max-w-md" />

      <div className="mt-10">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-4 h-12 w-64" />
        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </div>

      <div className="mt-10">
        <Skeleton className="h-6 w-24" />
        <div className="mt-4 grid gap-8 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
