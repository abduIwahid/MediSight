import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { ModelRegistryView } from "@/components/shared/ModelRegistryView"
import { mlServiceFetch } from "@/lib/ml-service"

export const dynamic = 'force-dynamic'

export default async function AdminModelsPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const { data: models } = await supabase
    .from('model_registry')
    .select('*')
    .order('created_at', { ascending: false })

  // Fetch live model status from FastAPI (open endpoint — no key required)
  let liveStatus: any = null
  try {
    const res = await mlServiceFetch('/model-status', {
      requireAuth: false,
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(5000)
    })
    if (res?.ok) liveStatus = await res.json()
  } catch (e) {
    // ML service offline - degrade gracefully
  }

  return <ModelRegistryView models={models || []} liveStatus={liveStatus} />
}
