import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { UserManagementView } from "@/components/shared/UserManagementView"
import { getCurrentProfile } from "@/lib/current-profile"

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  // The viewer's own profile — shared with the admin layout's read for
  // this request via React cache (see lib/current-profile).
  const viewer = await getCurrentProfile()

  // The admin layout also admits data_scientist (for read-only model and
  // audit views), but user management WRITES are super/hospital-admin
  // only at the database level. Showing the controls to anyone else
  // renders fake controls: their writes match zero RLS rows and silently
  // do nothing. Say so instead.
  if (!viewer || !viewer.role || !['super_admin', 'hospital_admin'].includes(viewer.role)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">You don&apos;t have permission to manage users</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          User management is limited to super admins and hospital admins. Your role can use the other admin views, such as model registry, MLOps, and audit logs.
        </p>
      </div>
    )
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*, hospitals(name)')
    .order('created_at', { ascending: false })
    .limit(1000)

  const { data: hospitals } = await supabase
    .from('hospitals')
    .select('id, name')
    .order('name')

  return <UserManagementView profiles={profiles || []} hospitals={hospitals || []} viewerRole={viewer.role} />
}
