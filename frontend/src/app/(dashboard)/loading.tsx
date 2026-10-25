import { PulseLoader } from "@/components/shared/PulseLoader"

/**
 * Group-level loading state for the whole staff shell (QA Round 1,
 * item 4): routes without their own loading.tsx (patients, doctors,
 * alerts, admin, …) show the shared brand loader instead of a blank
 * content area while their server component runs.
 */
export default function DashboardGroupLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true">
      <PulseLoader />
    </div>
  )
}
