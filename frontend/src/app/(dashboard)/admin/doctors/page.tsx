import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { DoctorVerificationView, type DoctorRow } from "@/components/shared/DoctorVerificationView"
import { getCurrentProfile } from "@/lib/current-profile"

export const dynamic = 'force-dynamic'

export default async function AdminDoctorsPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  // The viewer's own profile — shared with the admin layout's read for
  // this request via React cache (see lib/current-profile).
  const viewer = await getCurrentProfile()

  // Verification decisions are super/hospital-admin writes at the
  // database level. Other admin-area roles (data_scientist) would see
  // Approve/Reject buttons whose writes silently match zero RLS rows —
  // show an honest permission state instead of fake controls.
  if (!viewer || !viewer.role || !['super_admin', 'hospital_admin'].includes(viewer.role)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">You don&apos;t have permission to verify doctors</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Doctor verification is limited to super admins and hospital admins. Your role can use the other admin views, such as model registry and MLOps.
        </p>
      </div>
    )
  }

  const { data: doctors } = await supabase
    .from('doctors')
    .select('user_id, license_number, hospital, specialization, experience, phone, status, created_at, profile:user_id(full_name, email)')
    .order('created_at', { ascending: false })

  const rows = (doctors as unknown as DoctorRow[]) || []

  // Decision stamps (reviewed_by / reviewed_at) are fetched separately
  // (QA Round 2, cluster 20d): those columns arrive with migration
  // 20261025200000, and selecting them in the main query would break
  // the whole queue on a database where it has not been applied yet.
  // If this query errors, the queue simply renders without stamps.
  const { data: stamps } = await supabase
    .from('doctors')
    .select('user_id, reviewed_by, reviewed_at, reviewer:reviewed_by(full_name)')
  if (stamps) {
    const byUser = new Map(
      (stamps as unknown as { user_id: string; reviewed_by: string | null; reviewed_at: string | null; reviewer: { full_name: string } | null }[])
        .map((s) => [s.user_id, s])
    )
    for (const row of rows) {
      const stamp = byUser.get(row.user_id)
      if (stamp) {
        row.reviewed_by = stamp.reviewed_by
        row.reviewed_at = stamp.reviewed_at
        row.reviewer = stamp.reviewer
      }
    }
  }

  return <DoctorVerificationView doctors={rows} viewerName={viewer.full_name} />
}
