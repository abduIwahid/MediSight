import { NextResponse } from "next/server"
import { mlServiceFetch } from "@/lib/ml-service"
import { createClient } from "@/lib/supabase/server"
import { validateMLPayload } from "@/lib/validate-ml-payload"

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

  // Same bounded, schema-checked forwarding as /api/predict
  // (QA Round 3, api-security M2 / adversarial F9).
  const contentLength = Number(request.headers.get("content-length") || 0)
  if (contentLength > 16_384) {
    return NextResponse.json({ error: "That request is too large." }, { status: 413 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "We couldn't read that request. Please try again." }, { status: 400 })
  }

  const validated = validateMLPayload(payload)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  let response: Response | null
  try {
    response = await mlServiceFetch("/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validated.value),
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
    console.error("[api/explain] ML service rejected the payload (422).")
    return NextResponse.json(
      { error: "The explanation service could not use those inputs. Please review the values and try again." },
      { status: 422 }
    )
  }

  if (!response.ok) {
    console.error(`[api/explain] ML service responded with ${response.status}.`)
    return NextResponse.json(UNAVAILABLE, { status: 503 })
  }

  const data = await response.json()
  return NextResponse.json(data)
}
