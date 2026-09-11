import { Skeleton } from "@ame-de-fil/ui";

// Shared across the Users and Audit log tabs (Next.js cascades this down
// to /administration/audit-log too) — previously missing, so both silently
// fell back to the dashboard's own stat-card-shaped loading.tsx. Mirrors
// inventory/loading.tsx's tab-strip-plus-table shape; users/[id] gets its
// own more specific loading.tsx since a detail page has a different layout
// entirely.
export default function AdministrationLoading() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-6">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="mt-6 flex gap-6 border-b border-neutral-200 pb-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>

      <div className="mt-8 hidden md:block">
        <div className="border-b border-neutral-300 pb-3">
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
        <div className="divide-y divide-neutral-200">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-6 py-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-sm" />
              <Skeleton className="h-5 w-20 rounded-sm" />
              <Skeleton className="ml-auto h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 divide-y divide-neutral-200 md:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
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
