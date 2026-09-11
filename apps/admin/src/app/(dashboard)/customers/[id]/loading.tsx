import { Skeleton } from "@ame-de-fil/ui";

// Overrides customers/loading.tsx for this nested segment — a detail page
// (back link, title+badge, recent-orders list, account-info card) has a
// different shape than the list it's reached from. Mirrors
// administration/users/[id]/loading.tsx's own back-link-plus-two-column
// shape.
export default function CustomerDetailLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 flex items-center gap-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-16 rounded-sm" />
      </div>
      <Skeleton className="mt-2 h-4 w-32" />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <Skeleton className="h-6 w-32" />
          <div className="mt-3 flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}
