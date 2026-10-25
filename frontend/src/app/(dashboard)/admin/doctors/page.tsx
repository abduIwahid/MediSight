import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { DoctorVerificationView, type DoctorRow } from "@/components/shared/DoctorVerificationView"

export const dynamic = 'force-dynamic'

export default async function AdminDoctorsPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { data: viewer } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).single()
    : { data: null }

  // Verification decisions are super/hospital-admin writes at the
  // database level. Other admin-area roles (data_scientist) would see
  // Approve/Reject buttons whose writes silently match zero RLS rows —
  // show an honest permission state instead of fake controls.
  if (!viewer || !['super_admin', 'hospital_admin'].includes(viewer.role)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">You don&apos;t have permission to verify doctors</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Doctor verification is limited to super admins and hospital admins. Your role can use the other admin views, such as model registry, MLOps, and audit logs.
        </p>
      </div>
    )
  }

  const { data: doctors } = await supabase
    .from('doctors')
    .select('user_id, license_number, hospital, specialization, experience, phone, status, created_at, profile:user_id(full_name, email)')
    .order('created_at', { ascending: false })

  return <DoctorVerificationView doctors={(doctors as unknown as DoctorRow[]) || []} />
}
