import { Skeleton } from "@ame-de-fil/ui";

// Mirrors ../../[id]/loading.tsx (Category detail) exactly — see that
// file's own comment for why this isn't shared across the two route trees.
export default function CollectionDetailLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 h-9 w-56" />

      <div className="mt-8">
        <Skeleton className="h-6 w-24" />
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      </div>

      <div className="mt-10 border-t border-neutral-200 pt-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-3 h-10 w-32" />
      </div>
    </div>
  );
}
