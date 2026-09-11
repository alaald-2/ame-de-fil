import { Skeleton } from "@ame-de-fil/ui";

// Shaped like the real table/record layout — see customers/loading.tsx for
// the fuller rationale. Added from the start this time (the visual review
// found Inventory/Administration had shipped without their own loading.tsx
// and silently fell back to the dashboard's stat-card skeleton).
export default function ProductsLoading() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-6">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>

      <div className="mt-6 flex justify-end">
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="mt-6 hidden md:block">
        <div className="border-b border-neutral-300 pb-3">
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
        <div className="divide-y divide-neutral-200">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="flex items-center gap-6 py-4">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-5 w-20 rounded-sm" />
              <Skeleton className="ml-auto h-4 w-10" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 divide-y divide-neutral-200 md:hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="py-4">
            <Skeleton className="h-4 w-2/3" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
