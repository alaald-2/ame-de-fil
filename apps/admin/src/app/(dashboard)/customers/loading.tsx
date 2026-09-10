import { Skeleton } from "@ame-de-fil/ui";

// Shaped like the real table/record layout (six loose columns on desktop,
// stacked records on mobile), not a centered spinner — Next renders this
// automatically while page.tsx's data fetch is in flight, including on
// `?page=` pagination navigations.
export default function CustomersLoading() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>

      <div className="mt-8 hidden md:block">
        <div className="border-b border-neutral-300 pb-3">
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
        <div className="divide-y divide-neutral-200">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="flex items-center gap-6 py-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-sm" />
              <Skeleton className="ml-auto h-4 w-10" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 divide-y divide-neutral-200 md:hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="py-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/3" />
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
