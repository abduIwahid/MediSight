import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { DashboardClientView } from "@/components/shared/DashboardClientView"
import { getCurrentProfile } from "@/lib/current-profile"

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  // All six reads are independent — run them in one parallel batch
  // instead of the recent-alerts fetch waterfalling ahead of the counts.
  // Quick stats. Definitions are the same on every surface (QA Round 1):
  // Total Patients counts the clinical patients table; Active Doctors
  // counts APPROVED doctors only (doctors.status), not every profile
  // that happens to carry the doctor role.
  const [alertsRes, patientsRes, alertsCountRes, doctorsRes, criticalRes, predictionsRes] = await Promise.all([
    // Recent new alerts (both High and Critical)
    supabase
      .from('alerts')
      .select('*, patients(mrn)')
      .eq('status', 'New')
      .in('severity', ['Critical', 'High'])
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('patients').select('*', { count: 'exact', head: true }),
    supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'New'),
    supabase.from('doctors').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'New').eq('severity', 'Critical'),
    supabase.from('predictions').select('*', { count: 'exact', head: true }),
  ])

  const recentAlerts = alertsRes.data
  const alertsError = alertsRes.error

  // The viewer's scope (QA Round 3, dashboard-analytics H3): the
  // counts below are RLS-scoped, and the page must SAY which scope —
  // previously every viewer saw identical unlabelled numbers that
  // silently meant different things per role.
  const viewer = await getCurrentProfile()
  let hospitalName: string | null = null
  if (viewer?.hospital_id) {
    const { data: hospital } = await supabase
      .from('hospitals')
      .select('name')
      .eq('id', viewer.hospital_id)
      .single()
    hospitalName = hospital?.name ?? null
  }

  const statsError = Boolean(
    alertsError || patientsRes.error || alertsCountRes.error || doctorsRes.error || criticalRes.error || predictionsRes.error
  )

  return (
    <DashboardClientView
      recentAlerts={recentAlerts || []}
      totalPatients={patientsRes.count || 0}
      totalAlerts={alertsCountRes.count || 0}
      totalDoctors={doctorsRes.count || 0}
      criticalAlerts={criticalRes.count || 0}
      totalPredictions={predictionsRes.count || 0}
      statsError={statsError}
      alertsError={Boolean(alertsError)}
      viewerRole={viewer?.role ?? null}
      hospitalName={hospitalName}
    />
  )
}
