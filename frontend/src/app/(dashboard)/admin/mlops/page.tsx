import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import nextDynamic from "next/dynamic"
import { PulseLoader } from "@/components/shared/PulseLoader"
import type { DriftData, MlModelStatus } from "@/components/shared/MLOpsView"
import { mlServiceFetch } from "@/lib/ml-service"
import { getCurrentProfile } from "@/lib/current-profile"

// Recharts is heavy — load the MLOps view (and its charts) on demand.
// (Aliased import: a bare `dynamic` collides with this route's
// `export const dynamic` segment config.)
const MLOpsView = nextDynamic(
  () => import("@/components/shared/MLOpsView").then((m) => m.MLOpsView),
  { loading: () => <PulseLoader label="Loading MLOps" /> }
)

export const dynamic = 'force-dynamic'

const TREND_CAP = 2000

export default async function AdminMLOpsPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  // Everything this page needs runs in parallel (QA Round 3, perf
  // P-1): the two ML probes used to complete (up to their 4s timeout)
  // BEFORE the trend query and the viewer-profile fetch even started,
  // so a sleeping ML service added its full timeout to every load.
  // The trend query is also capped now — it shipped every prediction
  // row of the last 14 days to the browser, however many that was.
  const [driftRes, statusRes, trendRes, viewer] = await Promise.all([
    mlServiceFetch('/drift-status', { cache: 'no-store', signal: AbortSignal.timeout(4000) }).catch(() => null),
    mlServiceFetch('/model-status', { requireAuth: false, cache: 'no-store', signal: AbortSignal.timeout(4000) }).catch(() => null),
    supabase
      .from('predictions')
      .select('created_at, severity, probability')
      .gte('created_at', twoWeeksAgo)
      .order('created_at', { ascending: true })
      .limit(TREND_CAP),
    getCurrentProfile(),
  ])

  // Per-capability connection state (QA Round 3, admin A5): drift and
  // model status are separate probes — one can answer while the other
  // fails, and the single shared boolean used to report "Connected"
  // for both.
  let driftData: DriftData | null = null
  let driftConnected = false
  if (driftRes && driftRes.ok) {
    driftData = await driftRes.json()
    driftConnected = true
  }
  let modelStatus: MlModelStatus | null = null
  let statusConnected = false
  if (statusRes && statusRes.ok) {
    modelStatus = await statusRes.json()
    statusConnected = true
  }
  // When the ML service is offline both stay null and the view renders
  // an honest offline state. (This page used to fabricate a demo
  // status — status 'idle', version '1.0.0' — removed in QA Round 1,
  // item 55.) The service's URL is server-only configuration and is
  // never passed to the client (QA Round 3, api-security M4).

  if (trendRes.error) {
    console.error("MLOps prediction trend failed to load:", trendRes.error)
  }

  return (
    <MLOpsView
      driftData={driftData}
      modelStatus={modelStatus}
      predictionTrend={trendRes.data || []}
      trendError={Boolean(trendRes.error)}
      trendTruncated={(trendRes.data || []).length >= TREND_CAP}
      serviceConnected={statusConnected}
      driftConnected={driftConnected}
      statusConnected={statusConnected}
      viewerRole={viewer?.role ?? undefined}
    />
  )
}
