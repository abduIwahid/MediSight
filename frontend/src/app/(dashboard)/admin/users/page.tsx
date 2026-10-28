import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { UserManagementView } from "@/components/shared/UserManagementView"
import { getCurrentProfile } from "@/lib/current-profile"
import type { ProfileRow } from "@/lib/types"

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
          User management is limited to super admins and hospital admins. Your role can use the other admin views, such as model registry and MLOps.
        </p>
      </div>
    )
  }

  // Parallel, column-scoped, and error-aware (QA Round 3, perf P-5 /
  // states F-03): the two queries used to run in sequence with
  // select('*'), and a failed profiles fetch rendered as an empty
  // "No users match" table.
  const [profilesResult, hospitalsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, role, hospital_id, created_at, hospitals(name)')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('hospitals')
      .select('id, name')
      .order('name'),
  ])
  if (profilesResult.error) {
    console.error("Admin users list failed to load:", profilesResult.error)
  }

  return (
    <UserManagementView
      profiles={(profilesResult.data ?? []) as unknown as ProfileRow[]}
      hospitals={hospitalsResult.data || []}
      viewerRole={viewer.role}
      viewerId={viewer.id}
      viewerHospitalId={viewer.hospital_id}
      loadError={Boolean(profilesResult.error)}
    />
  )
}
