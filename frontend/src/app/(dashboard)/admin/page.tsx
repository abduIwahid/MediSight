import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import Link from "next/link"
import { Users, Stethoscope, Clock, Activity } from "lucide-react"
import { getCurrentProfile } from "@/lib/current-profile"

export const dynamic = "force-dynamic"

export default async function AdminOverviewPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const viewer = await getCurrentProfile()
  const viewerRole = viewer?.role ?? null

  // The counts carry no hospital filter in code — each inherits its
  // table's RLS scope for the viewer (QA Round 2, hospital-admin #8):
  // patients and appointments are hospital-scoped for a hospital_admin,
  // while the doctors table is a shared directory (admin policies view
  // all doctors), so the doctor counts are platform-wide for every
  // admin. The labels below say exactly that instead of calling
  // everything "System-wide".
  let hospitalName: string | null = null
  if (viewerRole === "hospital_admin" && viewer?.hospital_id) {
    const { data: hospital } = await supabase
      .from("hospitals")
      .select("name")
      .eq("id", viewer.hospital_id)
      .single()
    hospitalName = hospital?.name ?? null
  }
  const facilityLabel = hospitalName || "Your hospital"
  const scopedLabel = viewerRole === "super_admin" ? "All hospitals" : viewerRole === "hospital_admin" ? facilityLabel : "Records you can access"
  const subtitle =
    viewerRole === "super_admin"
      ? "System-wide stats across doctors, patients, and appointments."
      : viewerRole === "hospital_admin"
        ? `Stats for ${facilityLabel} where records are hospital-scoped; doctor counts are platform-wide, because the doctor directory is shared.`
        : "Stats across doctors, patients, and appointments — each count reflects the records your role can access."

  // Stat definitions match the rest of the product (QA Round 1): Total
  // Patients counts clinical patient records (the patients table), and
  // the doctors stat counts APPROVED doctors only.
  const [patientsRes, doctorsRes, pendingRes, apptsRes] = await Promise.all([
    supabase.from("patients").select("id", { count: "exact", head: true }),
    supabase.from("doctors").select("user_id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("doctors").select("user_id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("appointments").select("id", { count: "exact", head: true }),
  ])
  const pendingDoctors = pendingRes.count
  const countsFailed = [patientsRes, doctorsRes, pendingRes, apptsRes].some((r) => r.error)

  // A failed count renders "—" on ITS card (QA Round 3, admin A9):
  // the page used to substitute 0 for a failed query, inventing the
  // most alarming possible value for the pending-approvals card.
  const display = (res: { error: unknown; count: number | null }) => (res.error ? "—" : res.count ?? 0)
  const stats = [
    { label: "Total Patients", value: display(patientsRes), icon: Users, accent: "text-[#2E7FA8] bg-[#2E7FA8]/10", scope: scopedLabel },
    { label: "Active Doctors", value: display(doctorsRes), icon: Stethoscope, accent: "text-primary bg-secondary", scope: viewerRole === "data_scientist" ? "Records you can access" : "Platform-wide" },
    { label: "Pending Approvals", value: display(pendingRes), icon: Clock, accent: "text-[#A85008] bg-[#D97706]/10", scope: viewerRole === "data_scientist" ? "Records you can access" : "Platform-wide" },
    { label: "Total Appointments", value: display(apptsRes), icon: Activity, accent: "text-[#1E7A46] bg-[#1E7A46]/10", scope: `${scopedLabel} · all statuses, incl. cancelled` },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {countsFailed && (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive-text">
          Some counts could not be loaded, so the figures below may be incomplete. Refresh the page to try again.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5 shadow-card">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.accent}`}>
              <s.icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{s.scope}</p>
          </div>
        ))}
      </div>

      {(pendingDoctors ?? 0) > 0 && (
        <div className="rounded-xl border border-[#D97706]/30 bg-[#FDF0DC] p-5">
          <p className="text-sm font-semibold text-[#A85008]">
            {pendingDoctors} doctor{pendingDoctors === 1 ? "" : "s"} waiting for approval —{" "}
            <Link href="/admin/doctors" className="underline">review now</Link>
          </p>
        </div>
      )}
    </div>
  )
}
