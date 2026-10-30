import { PageTitleSkeleton, ListSkeleton } from "@/components/shared/Skeletons"

export default function PatientAppointmentsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your appointments">
      <PageTitleSkeleton />
      <ListSkeleton rows={4} />
    </div>
  )
}
