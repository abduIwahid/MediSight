import { NextResponse } from "next/server"
import { mlServiceFetch } from "@/lib/ml-service"
import { validateMLPayload } from "@/lib/validate-ml-payload"
import { checkRateLimit, rateLimitBody, clientIp } from "@/lib/rate-limit"

const UNAVAILABLE = {
  error: "The risk check is unavailable right now. Please try again later.",
}

/**
 * Public, unauthenticated diabetes risk check for the landing page.
 *
 * Same model, same validation, same honesty rules as /api/predict —
 * the differences are the ones being a guest implies:
 *  - no account, so the rate limit keys on IP (10/minute, 50/day per
 *    IP — far above what a person clicking through the form can use,
 *    useless for a script farming free predictions);
 *  - nothing is stored: the answers are forwarded to the ML service
 *    and forgotten; the response carries only the score and band;
 *  - the response is minimal on purpose — no SHAP detail, no model
 *    internals for anonymous traffic.
 */
export async function POST(request: Request) {
  const ip = clientIp(request)
  const minute = checkRateLimit(`guest:${ip}`, 10, 60_000)
  if (!minute.allowed) {
    return NextResponse.json(rateLimitBody(), {
      status: 429,
      headers: { "Retry-After": String(minute.retryAfterSeconds) },
    })
  }
  const day = checkRateLimit(`guest-day:${ip}`, 50, 24 * 60 * 60_000)
  if (!day.allowed) {
    return NextResponse.json(rateLimitBody(), {
      status: 429,
      headers: { "Retry-After": String(day.retryAfterSeconds) },
    })
  }

  const contentLength = Number(request.headers.get("content-length") || 0)
  if (contentLength > 8_192) {
    return NextResponse.json({ error: "That request is too large." }, { status: 413 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that request. Please try again." },
      { status: 400 }
    )
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
    console.error("[api/guest-risk] ML service unreachable:", err)
    return NextResponse.json(UNAVAILABLE, { status: 503 })
  }

  if (!response) {
    console.error("[api/guest-risk] ML service is not configured.")
    return NextResponse.json(UNAVAILABLE, { status: 503 })
  }

  if (response.status === 422) {
    return NextResponse.json(
      { error: "The model could not use those answers. Please review them and try again." },
      { status: 422 }
    )
  }

  if (!response.ok) {
    console.error(`[api/guest-risk] ML service responded with ${response.status}.`)
    return NextResponse.json(UNAVAILABLE, { status: 503 })
  }

  const data = await response.json()
  const probability = typeof data?.probability === "number" ? data.probability : null
  const severity = typeof data?.severity === "string" ? data.severity : null
  if (probability === null || severity === null) {
    console.error("[api/guest-risk] ML service returned an unexpected payload.")
    return NextResponse.json(UNAVAILABLE, { status: 503 })
  }
  return NextResponse.json({ probability, severity })
}
