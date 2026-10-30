import { PageTitleSkeleton, PanelSkeleton } from "@/components/shared/Skeletons"

export default function PatientRiskLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your risk assessment">
      <PageTitleSkeleton />
      <div className="rounded-xl border bg-card p-6">
        <div className="h-4 w-44 animate-pulse rounded bg-secondary" />
        <div className="mt-3 h-12 w-32 animate-pulse rounded bg-secondary" />
        <div className="mt-4 h-16 animate-pulse rounded-lg bg-secondary/60" />
      </div>
      <PanelSkeleton lines={6} />
    </div>
  )
}
