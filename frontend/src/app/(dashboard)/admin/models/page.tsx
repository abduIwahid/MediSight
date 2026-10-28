import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { ModelRegistryView, type LiveModelStatus } from "@/components/shared/ModelRegistryView"
import { mlServiceFetch } from "@/lib/ml-service"

export const dynamic = 'force-dynamic'

export default async function AdminModelsPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  // Column-scoped, capped, error-aware (QA Round 3, admin A4 /
  // states F-04): select('*') with no limit shipped the whole table,
  // and a failed fetch rendered as "no models registered".
  const { data: models, error: modelsError } = await supabase
    .from('model_registry')
    .select('id, name, version, stage, metrics, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (modelsError) console.error("Model registry failed to load:", modelsError)

  // Fetch live model status from FastAPI (open endpoint — no key required)
  let liveStatus: LiveModelStatus | null = null
  try {
    const res = await mlServiceFetch('/model-status', {
      requireAuth: false,
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(5000)
    })
    if (res?.ok) liveStatus = await res.json()
  } catch {
    // ML service offline - degrade gracefully
  }

  return <ModelRegistryView models={models || []} liveStatus={liveStatus} loadError={Boolean(modelsError)} />
}
