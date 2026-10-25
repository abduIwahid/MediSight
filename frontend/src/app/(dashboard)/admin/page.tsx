import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import Link from "next/link"
import { Users, Stethoscope, Clock, Activity } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function AdminOverviewPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  // Stat definitions match the rest of the product (QA Round 1): Total
  // Patients counts clinical patient records (the patients table), and
  // the doctors stat counts APPROVED doctors only.
  const [patientsRes, doctorsRes, pendingRes, apptsRes] = await Promise.all([
    supabase.from("patients").select("id", { count: "exact", head: true }),
    supabase.from("doctors").select("user_id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("doctors").select("user_id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("appointments").select("id", { count: "exact", head: true }),
  ])
  const totalPatients = patientsRes.count
  const totalDoctors = doctorsRes.count
  const pendingDoctors = pendingRes.count
  const totalAppointments = apptsRes.count
  const countsFailed = [patientsRes, doctorsRes, pendingRes, apptsRes].some((r) => r.error)

  const stats = [
    { label: "Total Patients", value: totalPatients ?? 0, icon: Users, accent: "text-[#2E7FA8] bg-[#2E7FA8]/10" },
    { label: "Active Doctors", value: totalDoctors ?? 0, icon: Stethoscope, accent: "text-primary bg-secondary" },
    { label: "Pending Approvals", value: pendingDoctors ?? 0, icon: Clock, accent: "text-[#D97706] bg-[#D97706]/10" },
    { label: "Total Appointments", value: totalAppointments ?? 0, icon: Activity, accent: "text-[#1E7A46] bg-[#1E7A46]/10" },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">System-wide stats across doctors, patients, and appointments.</p>
      </div>

      {countsFailed && (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
          Some counts could not be loaded, so the figures below may be incomplete. Refresh the page to try again.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.accent}`}>
              <s.icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {(pendingDoctors ?? 0) > 0 && (
        <div className="rounded-2xl border border-[#D97706]/30 bg-[#FDF0DC] p-5">
          <p className="text-sm font-semibold text-[#A85008]">
            {pendingDoctors} doctor{pendingDoctors === 1 ? "" : "s"} waiting for approval —{" "}
            <Link href="/admin/doctors" className="underline">review now</Link>
          </p>
        </div>
      )}
    </div>
  )
}
