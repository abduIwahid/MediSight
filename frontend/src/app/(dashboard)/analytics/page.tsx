import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import nextDynamic from "next/dynamic"
import { PulseLoader } from "@/components/shared/PulseLoader"
import { getCurrentProfile } from "@/lib/current-profile"

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

  // The four reads are independent — one parallel batch instead of a
  // sequential waterfall. Caps and labels are unchanged.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [predictionsRes, patientsByHospitalRes, alertStatsRes, recentPredictionsRes] = await Promise.all([
    // Population-level predictions stats — explicitly capped at the most
    // recent 2,000 predictions; the view labels the cap when it is hit.
    supabase
      .from('predictions')
      .select('disease, severity, probability, created_at')
      .order('created_at', { ascending: false })
      .limit(2000),
    // Patient count per hospital — join hospitals table. Capped at
    // the most recent 2,000 patient records (was an unlabelled 10,000);
    // the view labels the cap when it is hit (QA Round 2, cluster 30).
    supabase
      .from('patients')
      .select('hospital_id, hospitals!patients_hospital_id_fkey(name)')
      .order('created_at', { ascending: false })
      .limit(2000),
    // Alert stats — explicitly capped at the most recent 2,000 alerts.
    supabase
      .from('alerts')
      .select('severity, status, created_at')
      .order('created_at', { ascending: false })
      .limit(2000),
    // Risk score distribution (30-day window) — explicitly capped at
    // the most recent 2,000 predictions in the window; without a limit
    // PostgREST silently truncated this at 1,000 rows (QA Round 2,
    // cluster 30). The view buckets by day itself, so newest-first
    // ordering here only decides WHICH rows the cap keeps.
    supabase
      .from('predictions')
      .select('probability, severity, disease, created_at')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(2000),
  ])

  const { data: predictions, error: predErr } = predictionsRes
  const { data: patientsByHospital, error: hospErr } = patientsByHospitalRes
  const { data: alertStats, error: alertErr } = alertStatsRes
  const { data: recentPredictions, error: recentErr } = recentPredictionsRes

  if (predErr) console.error("Analytics predictions error:", predErr)
  if (hospErr) console.error("Analytics hospital error:", hospErr)

  // Flatten hospitals relation (may be object or array depending on Supabase version)
  const flatPatients = (patientsByHospital || []).map((p: { hospital_id?: string | null; hospitals?: { name: string } | { name: string }[] | null }) => ({
    hospital_id: p.hospital_id,
    hospitals: Array.isArray(p.hospitals) ? p.hospitals[0] : p.hospitals
  }))

  if (alertErr) console.error("Analytics alerts error:", alertErr)

  const loadError = Boolean(predErr || hospErr || alertErr || recentErr)
  const viewer = await getCurrentProfile()

  return (
    <AnalyticsDashboard
      predictions={predictions || []}
      patientsByHospital={flatPatients}
      alertStats={alertStats || []}
      recentPredictions={recentPredictions || []}
      loadError={loadError}
      sourceErrors={{
        predictions: Boolean(predErr),
        hospitals: Boolean(hospErr),
        alerts: Boolean(alertErr),
        recent: Boolean(recentErr),
      }}
      viewerRole={viewer?.role ?? null}
    />
  )
}
