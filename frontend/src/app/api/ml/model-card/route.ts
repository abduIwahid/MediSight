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
 */
export async function GET() {
  try {
    const statusRes = await mlServiceFetch("/model-status", { requireAuth: false })
    if (!statusRes || !statusRes.ok) {
      return NextResponse.json({ live: false })
    }
    const status = await statusRes.json()

    let drift: { available: boolean; currentPsi: number | null; driftDetected: boolean; threshold: number | null } | null = null
    try {
      const driftRes = await mlServiceFetch("/drift-status")
      if (driftRes && driftRes.ok) {
        const d = await driftRes.json()
        drift = {
          available: Boolean(d.available),
          currentPsi: typeof d.current_psi === "number" ? d.current_psi : null,
          driftDetected: Boolean(d.drift_detected),
          threshold: typeof d.drift_threshold === "number" ? d.drift_threshold : null,
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
    })
  } catch {
    return NextResponse.json({ live: false })
  }
}
