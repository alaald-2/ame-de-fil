import { Skeleton } from "@ame-de-fil/ui";

// Overrides administration/loading.tsx for this one nested segment — a
// detail page has a completely different shape (back link, title + status
// badge + action button, roles/permissions body, an info card on the
// right) than the tabbed list it's reached from. Mirrors orders/[orderId]/
// loading.tsx's own back-link-plus-two-column shape.
export default function UserDetailLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-28" />
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-16 rounded-sm" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <Skeleton className="mt-2 h-4 w-32" />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <Skeleton className="h-6 w-20" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-6 w-24 rounded-sm" />
            <Skeleton className="h-6 w-20 rounded-sm" />
          </div>
          <Skeleton className="mt-4 h-9 w-64" />

          <Skeleton className="mt-8 h-6 w-40" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-6 w-28 rounded-sm" />
            <Skeleton className="h-6 w-28 rounded-sm" />
          </div>
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
