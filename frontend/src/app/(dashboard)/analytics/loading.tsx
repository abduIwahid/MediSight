import { PageTitleSkeleton, StatCardsSkeleton, PanelSkeleton } from "@/components/shared/Skeletons"

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading analytics">
      <PageTitleSkeleton wide />
      <StatCardsSkeleton count={4} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PanelSkeleton lines={6} />
        <PanelSkeleton lines={6} />
      </div>
    </div>
  )
}
