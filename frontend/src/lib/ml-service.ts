/**
 * Server-side access to the FastAPI ML service.
 *
 * This is the ONLY place the frontend reads the ML service configuration:
 *   - ML_SERVICE_URL     base URL of the FastAPI service (server-side only)
 *   - ML_SERVICE_API_KEY shared secret sent as the X-API-Key header
 *                        (must match the ML service's ML_SERVICE_API_KEY)
 *
 * Never import this from a client component — the API key must not reach
 * the browser. Client components talk to the Next.js proxy routes instead
 * (/api/predict, /api/ml/model-status, /api/admin/ml/retrain).
 */

export function getMlServiceUrl(): string | null {
  const url = process.env.ML_SERVICE_URL
  if (url) return url.replace(/\/$/, "")

  // A localhost default is acceptable for local development only, and it
  // must be loud — production without ML_SERVICE_URL is a misconfiguration,
  // never a silent localhost call.
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[ml-service] ML_SERVICE_URL is not set — defaulting to http://localhost:8000 for local development."
    )
    return "http://localhost:8000"
  }
  return null
}

export function getMlServiceApiKey(): string | null {
  return process.env.ML_SERVICE_API_KEY || null
}

/**
 * fetch() against the ML service with the API key attached.
 * Returns null when the service is not configured (no URL or no key), so
 * callers can degrade honestly instead of calling unauthenticated.
 *
 * Every call is time-bounded: `timeoutMs` (default 60s — the free-tier
 * Hugging Face Space this talks to can take most of that to wake from
 * sleep on a cold start). Callers that only need a quick liveness answer
 * (status checks) should pass a much shorter timeout. A caller-supplied
 * AbortSignal wins over the timeout.
 */
export async function mlServiceFetch(
  path: string,
  init: RequestInit & { requireAuth?: boolean; timeoutMs?: number } = {}
): Promise<Response | null> {
  const baseUrl = getMlServiceUrl()
  if (!baseUrl) return null

  const { requireAuth = true, timeoutMs = 60_000, headers, signal, ...rest } = init
  const finalHeaders = new Headers(headers)

  if (requireAuth) {
    const key = getMlServiceApiKey()
    if (!key) return null
    finalHeaders.set("X-API-Key", key)
  }

  return fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: finalHeaders,
    signal: signal ?? AbortSignal.timeout(timeoutMs),
  })
}
