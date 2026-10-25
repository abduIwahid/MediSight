import { NextResponse } from "next/server"
import { mlServiceFetch } from "@/lib/ml-service"

const UNAVAILABLE = {
  error: "Prediction service unavailable. No score was generated.",
}

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
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  let response: Response | null
  try {
    response = await mlServiceFetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

  // Validation errors from the ML service are safe to surface as-is —
  // they describe the caller's own input, not server internals.
  if (response.status === 422) {
    const data = await response
      .json()
      .catch(() => ({ error: "Invalid prediction input." }))
    return NextResponse.json(data, { status: 422 })
  }

  if (!response.ok) {
    console.error(`[api/predict] ML service responded with ${response.status}.`)
    return NextResponse.json(UNAVAILABLE, { status: 503 })
  }

  const data = await response.json()
  return NextResponse.json(data)
}
