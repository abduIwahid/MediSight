import { NextResponse } from "next/server"
import { mlServiceFetch } from "@/lib/ml-service"

/**
 * Public, read-only live status for the /model-card page.
 *
 * Composes the ML service's open /model-status endpoint and its
 * key-protected /drift-status endpoint. The drift call goes through
 * mlServiceFetch, which attaches the server-side X-API-Key — the key
 * itself is never returned or exposed. When the ML service is
 * unreachable or unconfigured, the route reports { live: false } and
 * the page shows its static facts plus an honest unavailable line.
 *
 * The metrics object from /model-status is deliberately NOT passed
 * through: the published performance figure is the documented held-out
 * result in the README, and mixing a second number here would confuse
 * the claim.
 *
 * This is a public page's status feed, so responses are CDN-cacheable
 * (s-maxage): a burst of visitors shares one upstream check instead of
 * each hitting the ML service. The upstream calls are also time-bounded
 * well below the mlServiceFetch default — a status probe must never
 * hold the page for a cold-start-scale wait.
 */
export const dynamic = "force-dynamic"

const LIVE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" }
const DOWN_HEADERS = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" }
const STATUS_TIMEOUT_MS = 10_000

/** The only upstream drift explanations this public route will relay —
 *  the literal strings the ML service's /drift-status can produce. */
const KNOWN_DRIFT_REASONS = new Set([
  "Model not loaded",
  "Training dataset not found for drift calculation",
  // "Drift calculation failed. See server logs." is deliberately NOT
  // relayed — it collapses to the generic unavailable line instead.
])

export async function GET() {
  try {
    const statusRes = await mlServiceFetch("/model-status", { requireAuth: false, timeoutMs: STATUS_TIMEOUT_MS })
    if (!statusRes || !statusRes.ok) {
      return NextResponse.json({ live: false }, { headers: DOWN_HEADERS })
    }
    const status = await statusRes.json()

    let drift: { available: boolean; currentPsi: number | null; driftDetected: boolean; threshold: number | null; reason: string | null } | null = null
    try {
      const driftRes = await mlServiceFetch("/drift-status", { timeoutMs: STATUS_TIMEOUT_MS })
      if (driftRes && driftRes.ok) {
        const d = await driftRes.json()
        drift = {
          available: Boolean(d.available),
          currentPsi: typeof d.current_psi === "number" ? d.current_psi : null,
          driftDetected: Boolean(d.drift_detected),
          threshold: typeof d.drift_threshold === "number" ? d.drift_threshold : null,
          // The upstream reason is mapped through an allowlist, never
          // forwarded verbatim (QA Round 3, api-security L7): it is
          // free text from another service and could carry internal
          // paths or echoed input. Unknown reasons collapse to a
          // generic line.
          reason:
            typeof d.reason === "string" && KNOWN_DRIFT_REASONS.has(d.reason)
              ? d.reason
              : d.available === false
                ? "Drift status is unavailable for this model."
                : null,
        }
      }
    } catch {
      drift = null
    }

    return NextResponse.json({
      live: true,
      modelLoaded: Boolean(status.model_loaded),
      modelName: status.model_name ?? null,
      version: status.version ?? null,
      lastTrained: status.last_trained ?? null,
      diseases: Array.isArray(status.diseases) ? status.diseases : [],
      drift,
    }, { headers: LIVE_HEADERS })
  } catch {
    return NextResponse.json({ live: false }, { headers: DOWN_HEADERS })
  }
}
