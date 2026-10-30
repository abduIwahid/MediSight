import { PageTitleSkeleton, ActionCardsSkeleton, PanelSkeleton } from "@/components/shared/Skeletons"

export default function PatientDashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your dashboard">
      <PageTitleSkeleton />
      <ActionCardsSkeleton count={3} />
      <PanelSkeleton lines={3} />
    </div>
  )
}
