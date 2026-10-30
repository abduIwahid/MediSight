import { PageTitleSkeleton, FilterChipsSkeleton, ListSkeleton } from "@/components/shared/Skeletons"

export default function AlertsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading alerts">
      <PageTitleSkeleton />
      <FilterChipsSkeleton count={4} />
      <ListSkeleton rows={6} />
    </div>
  )
}
