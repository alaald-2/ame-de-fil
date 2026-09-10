import { Skeleton } from "@ame-de-fil/ui";

export default function OrderDetailLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 flex items-center gap-3">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-24 rounded-sm" />
      </div>
      <Skeleton className="mt-2 h-4 w-64" />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
