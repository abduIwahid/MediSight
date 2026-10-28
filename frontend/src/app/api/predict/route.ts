import { NextResponse } from "next/server"
import { mlServiceFetch } from "@/lib/ml-service"
import { createClient } from "@/lib/supabase/server"
import { validateMLPayload } from "@/lib/validate-ml-payload"

const UNAVAILABLE = {
  error: "Prediction service unavailable. No score was generated.",
}

const STAFF_ROLES = ["doctor", "nurse", "hospital_admin", "super_admin", "data_scientist"]

/**
 * Proxies a structured clinical feature vector to the FastAPI ML service
 * (POST /predict) and returns the model's response verbatim.
 *
 * There is deliberately NO local fallback prediction: if the ML service is
 * unconfigured, unreachable, or fails, this route answers 503 and the UI
 * shows an explicit unavailable state. A fabricated score must never be
 * presented as model output.
 */
export async function POST(request: Request) {
  // Only signed-in clinical staff may run predictions. Middleware gates the
  // /predict *pages*, but this route must check for itself — a patient (or
  // an unapproved doctor) with a session could otherwise call it directly.
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

  // Bounded, schema-checked forwarding (QA Round 3, api-security M2 /
  // adversarial F9): the body used to go to the ML service untouched.
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
    response = await mlServiceFetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validated.value),
    })
  } catch (err) {
    console.error("[api/predict] ML service unreachable:", err)
    return NextResponse.json(UNAVAILABLE, { status: 503 })
  }

  if (!response) {
    // ML_SERVICE_URL / ML_SERVICE_API_KEY not configured on the server.
    console.error(
      "[api/predict] ML service is not configured (ML_SERVICE_URL and ML_SERVICE_API_KEY must be set)."
    )
    return NextResponse.json(UNAVAILABLE, { status: 503 })
  }

  // The upstream 422 body is NOT relayed (QA Round 3, api-security
  // M2): its input-echo can reflect attacker-controlled text into a
  // staff browser. The status survives; the body is ours.
  if (response.status === 422) {
    console.error("[api/predict] ML service rejected the payload (422).")
    return NextResponse.json(
      { error: "The prediction service could not use those inputs. Please review the values and try again." },
      { status: 422 }
    )
  }

  if (!response.ok) {
    console.error(`[api/predict] ML service responded with ${response.status}.`)
    return NextResponse.json(UNAVAILABLE, { status: 503 })
  }

  const data = await response.json()
  return NextResponse.json(data)
}
