import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { mlServiceFetch } from "@/lib/ml-service"

// Same roles the (dashboard)/admin layout admits.
const ADMIN_ROLES = ["super_admin", "hospital_admin", "data_scientist"]

/**
 * Server-side proxy for the ML service's POST /retrain endpoint.
 * The endpoint requires the ML service API key, which must never reach
 * the browser — the MLOps page calls this route instead of the ML
 * service directly.
 */
export async function POST() {
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

  if (!profile || !ADMIN_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 })
  }

  let response: Response | null
  try {
    response = await mlServiceFetch("/retrain", { method: "POST" })
  } catch (err) {
    console.error("[api/admin/ml/retrain] ML service unreachable:", err)
    return NextResponse.json(
      { error: "ML service unavailable." },
      { status: 503 }
    )
  }

  if (!response) {
    console.error(
      "[api/admin/ml/retrain] ML service is not configured (ML_SERVICE_URL and ML_SERVICE_API_KEY must be set)."
    )
    return NextResponse.json(
      { error: "ML service unavailable." },
      { status: 503 }
    )
  }

  if (!response.ok) {
    console.error(
      `[api/admin/ml/retrain] ML service responded with ${response.status}.`
    )
    return NextResponse.json(
      { error: "The ML service could not start retraining." },
      { status: 502 }
    )
  }

  const data = await response.json()
  return NextResponse.json(data)
}
