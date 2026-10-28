import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { mlServiceFetch } from "@/lib/ml-service"

/**
 * Server-side proxy for the ML service's open GET /model-status endpoint.
 * Client components (e.g. the AI assistant panel) use this route so the
 * ML service URL stays server-only configuration (ML_SERVICE_URL).
 *
 * Aligned with the model-card status route (QA Round 2, cluster 30):
 * a status probe is time-bounded to 10s (not the 60s cold-start default
 * a prediction call needs) and successful responses are CDN-cacheable
 * with the same s-maxage pattern, so a burst of panels shares one
 * upstream check.
 */
export const dynamic = "force-dynamic"

const STATUS_TIMEOUT_MS = 10_000
const LIVE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" }

export async function GET() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  let response: Response | null
  try {
    response = await mlServiceFetch("/model-status", { requireAuth: false, timeoutMs: STATUS_TIMEOUT_MS })
  } catch {
    response = null
  }

  if (!response || !response.ok) {
    return NextResponse.json(
      { error: "ML service unavailable." },
      { status: 503 }
    )
  }

  const data = await response.json()
  return NextResponse.json(data, { headers: LIVE_HEADERS })
}
