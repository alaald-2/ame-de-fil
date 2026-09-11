import { Skeleton } from "@ame-de-fil/ui";

// Mirrors orders/[orderId]/loading.tsx's back-link-plus-sections shape.
export default function ProductDetailLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-28" />
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-20 rounded-sm" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <Skeleton className="mt-2 h-4 w-48" />

      <div className="mt-8">
        <Skeleton className="h-6 w-32" />
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </div>

      <div className="mt-10">
        <Skeleton className="h-6 w-24" />
        <div className="mt-4 flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
