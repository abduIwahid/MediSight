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
// Signed-in staff only (QA Round 3, api-security M1): the response is
// per-user operational detail, so it is never CDN-shared, and the body
// is an allowlist — the upstream document used to be relayed verbatim.
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" }

const STAFF_ROLES = ["doctor", "nurse", "hospital_admin", "super_admin", "admin", "data_scientist"]

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (!profile || !STAFF_ROLES.includes(profile.role as string)) {
    return NextResponse.json({ error: "Staff access required." }, { status: 403 })
  }
  if (profile.role === "doctor") {
    const { data: doctor } = await supabase
      .from("doctors")
      .select("status")
      .eq("user_id", user.id)
      .single()
    if (doctor?.status !== "approved") {
      return NextResponse.json({ error: "Doctor account is not approved yet." }, { status: 403 })
    }
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
      { status: 503, headers: PRIVATE_HEADERS }
    )
  }

  const data = await response.json()
  // Metrics are all-or-nothing: the chat panel formats all three, so a
  // partial object would break its rendering.
  const metrics =
    data?.metrics &&
    typeof data.metrics === "object" &&
    typeof data.metrics.auc_roc === "number" &&
    typeof data.metrics.f1_score === "number" &&
    typeof data.metrics.accuracy === "number"
      ? {
          auc_roc: data.metrics.auc_roc,
          f1_score: data.metrics.f1_score,
          accuracy: data.metrics.accuracy,
        }
      : undefined
  return NextResponse.json(
    {
      status: typeof data?.status === "string" ? data.status : undefined,
      model_loaded: Boolean(data?.model_loaded),
      model_name: typeof data?.model_name === "string" ? data.model_name : undefined,
      version: typeof data?.version === "string" ? data.version : undefined,
      metrics,
    },
    { headers: PRIVATE_HEADERS }
  )
}
