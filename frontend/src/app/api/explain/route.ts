import { NextResponse } from "next/server"
import { mlServiceFetch } from "@/lib/ml-service"
import { createClient } from "@/lib/supabase/server"

const UNAVAILABLE = {
  error: "Explanation service unavailable. No explanation was generated.",
}

const STAFF_ROLES = ["doctor", "nurse", "hospital_admin", "super_admin", "data_scientist"]

/**
 * Proxies a clinical feature vector to the FastAPI ML service
 * (POST /explain) and returns the SHAP explanation verbatim:
 * { shap_values: {feature: number}, base_value: number,
 *   clinical_explanation: string }.
 *
 * The /predict response carries no explanation, so the run-prediction
 * flows call this right after a successful prediction and store the
 * result on the prediction's `explanations` row. Same staff-only gate as
 * /api/predict, and the same honesty rule: no local fallback — if the ML
 * service is down the caller is told so and stores nothing.
 */
export async function POST(request: Request) {
  const supabase = createClient()
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

  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Clinical staff access required." }, { status: 403 })
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

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  let response: Response | null
  try {
    response = await mlServiceFetch("/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error("[api/explain] ML service unreachable:", err)
    return NextResponse.json(UNAVAILABLE, { status: 503 })
  }

  if (!response) {
    console.error(
      "[api/explain] ML service is not configured (ML_SERVICE_URL and ML_SERVICE_API_KEY must be set)."
    )
    return NextResponse.json(UNAVAILABLE, { status: 503 })
  }

  if (response.status === 422) {
    const data = await response
      .json()
      .catch(() => ({ error: "Invalid explanation input." }))
    return NextResponse.json(data, { status: 422 })
  }

  if (!response.ok) {
    console.error(`[api/explain] ML service responded with ${response.status}.`)
    return NextResponse.json(UNAVAILABLE, { status: 503 })
  }

  const data = await response.json()
  return NextResponse.json(data)
}
