import { PageTitleSkeleton, StatCardsSkeleton, PanelSkeleton } from "@/components/shared/Skeletons"

export default function PatientChartLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading patient record">
      <PageTitleSkeleton />
      <StatCardsSkeleton count={4} />
      <div className="grid gap-6 lg:grid-cols-3">
        <PanelSkeleton lines={3} />
        <div className="space-y-6 lg:col-span-2">
          <PanelSkeleton lines={5} />
          <PanelSkeleton lines={4} />
        </div>
      </div>
    </div>
  )
}
