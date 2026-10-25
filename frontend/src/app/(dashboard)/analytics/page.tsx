import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import nextDynamic from "next/dynamic"
import { PulseLoader } from "@/components/shared/PulseLoader"

// The analytics view pulls in recharts — load it lazily so the chart
// library is not in the first bundle for this route. (The import is
// aliased: a bare `dynamic` import collides with this route's
// `export const dynamic` segment config.)
const AnalyticsDashboard = nextDynamic(
  () => import("@/components/shared/AnalyticsDashboard").then((m) => m.AnalyticsDashboard),
  { loading: () => <div className="flex min-h-[40vh] items-center justify-center"><PulseLoader /></div> }
)

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  // Population-level predictions stats — explicitly capped at the most
  // recent 2,000 predictions; the view labels the cap when it is hit.
  const { data: predictions, error: predErr } = await supabase
    .from('predictions')
    .select('disease, severity, probability, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)

  if (predErr) console.error("Analytics predictions error:", predErr)

  // Patient count per hospital — join hospitals table
  const { data: patientsByHospital, error: hospErr } = await supabase
    .from('patients')
    .select('hospital_id, hospitals!patients_hospital_id_fkey(name)')
    .limit(10000)

  if (hospErr) console.error("Analytics hospital error:", hospErr)

  // Flatten hospitals relation (may be object or array depending on Supabase version)
  const flatPatients = (patientsByHospital || []).map((p: { hospital_id?: string | null; hospitals?: { name: string } | { name: string }[] | null }) => ({
    hospital_id: p.hospital_id,
    hospitals: Array.isArray(p.hospitals) ? p.hospitals[0] : p.hospitals
  }))

  // Alert stats — explicitly capped at the most recent 2,000 alerts.
  const { data: alertStats, error: alertErr } = await supabase
    .from('alerts')
    .select('severity, status, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)

  if (alertErr) console.error("Analytics alerts error:", alertErr)

  // Risk score distribution (30-day window)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentPredictions, error: recentErr } = await supabase
    .from('predictions')
    .select('probability, severity, disease, created_at')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: true })

  const loadError = Boolean(predErr || hospErr || alertErr || recentErr)

  return (
    <AnalyticsDashboard
      predictions={predictions || []}
      patientsByHospital={flatPatients}
      alertStats={alertStats || []}
      recentPredictions={recentPredictions || []}
      loadError={loadError}
    />
  )
}
