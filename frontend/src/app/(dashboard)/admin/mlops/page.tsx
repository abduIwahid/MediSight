import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import nextDynamic from "next/dynamic"
import { PulseLoader } from "@/components/shared/PulseLoader"
import type { DriftData, MlModelStatus } from "@/components/shared/MLOpsView"
import { getMlServiceUrl, mlServiceFetch } from "@/lib/ml-service"
import { getCurrentProfile } from "@/lib/current-profile"

// Recharts is heavy — load the MLOps view (and its charts) on demand.
// (Aliased import: a bare `dynamic` collides with this route's
// `export const dynamic` segment config.)
const MLOpsView = nextDynamic(
  () => import("@/components/shared/MLOpsView").then((m) => m.MLOpsView),
  { loading: () => <PulseLoader label="Loading MLOps" /> }
)

export const dynamic = 'force-dynamic'

export default async function AdminMLOpsPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  // Attempt to connect to FastAPI ML service
  let driftData: DriftData | null = null
  let modelStatus: MlModelStatus | null = null
  let serviceConnected = false
  const ML_URL = getMlServiceUrl() || 'not configured'

  try {
    const [driftRes, statusRes] = await Promise.allSettled([
      // /drift-status requires the ML service API key (attached by mlServiceFetch)
      mlServiceFetch('/drift-status', { cache: 'no-store', signal: AbortSignal.timeout(4000) }),
      // /model-status is an open endpoint — no key required
      mlServiceFetch('/model-status', { requireAuth: false, cache: 'no-store', signal: AbortSignal.timeout(4000) })
    ])
    if (driftRes.status === 'fulfilled' && driftRes.value?.ok) {
      driftData = await driftRes.value.json()
      serviceConnected = true
    }
    if (statusRes.status === 'fulfilled' && statusRes.value?.ok) {
      modelStatus = await statusRes.value.json()
      serviceConnected = true
    }
  } catch {
    // ML service offline — modelStatus stays null and the view renders an
    // honest offline state. (This page used to fabricate a demo status —
    // status 'idle', version '1.0.0' — and pass it off as real data;
    // removed in QA Round 1, item 55.)
  }

  // Prediction volume trend from Supabase (always available)
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: predictionTrend } = await supabase
    .from('predictions')
    .select('created_at, severity, probability')
    .gte('created_at', twoWeeksAgo)
    .order('created_at', { ascending: true })

  // The viewer's role decides whether the Retrain control is offered
  // (super admins only — the API route enforces the same rule).
  const viewer = await getCurrentProfile()

  return (
    <MLOpsView
      driftData={driftData}
      modelStatus={modelStatus}
      predictionTrend={predictionTrend || []}
      serviceConnected={serviceConnected}
      mlServiceUrl={ML_URL}
      viewerRole={viewer?.role ?? undefined}
    />
  )
}

