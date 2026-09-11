import { Skeleton } from "@ame-de-fil/ui";

// Overrides products/loading.tsx (its list-table shape doesn't match a
// form page) — the exact mismatch class of bug the last checkpoint's
// visual review found and fixed for Inventory/Administration.
export default function NewProductLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-9 w-56" />
      <div className="mt-8 flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
