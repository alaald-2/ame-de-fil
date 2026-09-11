import { Skeleton } from "@ame-de-fil/ui";

// Shared shape for both Content tabs (Categories default, Collections at
// /content/collections — Next.js cascades this down to that nested segment
// too, mirroring administration/loading.tsx's own tab-strip-plus-table
// convention). /content/[id] and /content/collections/[id] each get their
// own more specific loading.tsx since a detail page has a different layout.
export default function ContentLoading() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-6">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>

      <div className="mt-6 flex gap-6 border-b border-neutral-200 pb-3">
        <Skeleton className="h-4 w-20" />
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
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-6 py-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="ml-auto h-4 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 divide-y divide-neutral-200 md:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="py-4">
            <Skeleton className="h-4 w-2/3" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
