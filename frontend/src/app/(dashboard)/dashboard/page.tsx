import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { DashboardClientView } from "@/components/shared/DashboardClientView"

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
    />
  )
}
