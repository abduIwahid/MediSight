import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { AuditLogView } from "@/components/shared/AuditLogView"
import { getCurrentProfile } from "@/lib/current-profile"

export const dynamic = 'force-dynamic'

export default async function AdminAuditPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  // The audit SELECT policy admits super_admin + hospital_admin only.
  // The admin layout also admits data_scientist, whose query would
  // silently return zero rows and render as an empty trail — the same
  // fake-empty class as a failed fetch. Show the honest permission
  // state instead (QA Round 2, SA-9).
  const viewer = await getCurrentProfile()
  if (!viewer?.role || !['super_admin', 'hospital_admin'].includes(viewer.role)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">You don&apos;t have permission to view the audit trail</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The audit trail is limited to super admins and hospital admins, because entries can contain patient-record history. Your role can use the other admin views, such as model registry and MLOps.
        </p>
      </div>
    )
  }

  const { data: auditLogs, error } = await supabase
    .from('audit_logs')
    .select('*, profiles(full_name, role)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error("Audit log fetch failed:", error.message)
  }

  // A failed fetch must NOT look like an empty trail (QA Round 2,
  // cluster 20f): the view renders an explicit error banner when
  // loadError is set, instead of the ordinary "no entries" state.
  return <AuditLogView logs={auditLogs || []} loadError={Boolean(error)} />
}
