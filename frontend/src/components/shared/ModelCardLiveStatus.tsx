"use client"

import { useEffect, useState } from "react"
import { SEVERITY_HEX } from "@/lib/status"

interface LiveStatus {
  live: boolean
  modelLoaded?: boolean
  modelName?: string | null
  version?: string | null
  lastTrained?: string | null
  diseases?: string[]
  drift?: {
    available: boolean
    currentPsi: number | null
    driftDetected: boolean
    threshold: number | null
    /** The ML service's own reason when no baseline could be computed —
     *  shown verbatim, never paraphrased (QA Round 2, R2-DS-10). */
    reason: string | null
  } | null
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })
}

/**
 * The live-status island of the model card (QA Round 3, performance
 * P-10): the page itself is a server component so the documented
 * facts render statically; only this section fetches
 * /api/ml/model-card in the browser.
 */
export function ModelCardLiveStatus() {
  const [live, setLive] = useState<LiveStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/ml/model-card")
      .then((res) => res.json())
      .then((data: LiveStatus) => {
        if (!cancelled) setLive(data)
      })
      .catch(() => {
        if (!cancelled) setLive({ live: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
        <section className="mt-4 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Live service status</h2>
          {live === null ? (
            <p className="mt-3 text-sm text-muted-foreground">Checking the ML service…</p>
          ) : !live.live ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Live status unavailable — the ML service could not be reached just now. The facts above are from
              the project documentation and stand on their own.
            </p>
          ) : (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-baseline justify-between gap-4 rounded-lg bg-background px-4 py-2.5">
                <dt className="text-muted-foreground">Service</dt>
                <dd className="font-mono font-semibold" style={{ color: live.modelLoaded ? SEVERITY_HEX.Low : SEVERITY_HEX.High }}>
                  {live.modelLoaded ? "Model loaded" : "Model not loaded"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 rounded-lg bg-background px-4 py-2.5">
                <dt className="text-muted-foreground">Model</dt>
                <dd className="font-mono font-semibold">
                  {live.modelName || "—"}
                  {live.version ? ` · ${live.version}` : ""}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 rounded-lg bg-background px-4 py-2.5">
                <dt className="text-muted-foreground">Last trained</dt>
                <dd className="font-mono font-semibold">{fmtDate(live.lastTrained)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 rounded-lg bg-background px-4 py-2.5">
                <dt className="text-muted-foreground">Trained conditions served</dt>
                <dd className="font-mono font-semibold">{(live.diseases || []).join(", ") || "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 rounded-lg bg-background px-4 py-2.5 sm:col-span-2">
                <dt className="text-muted-foreground">Drift baseline (training data, PSI)</dt>
                <dd className="font-mono font-semibold">
                  {!live.drift
                    ? "Status unavailable"
                    : !live.drift.available
                      ? (live.drift.reason ?? "Baseline unavailable")
                      : live.drift.currentPsi == null
                        ? "—"
                        : `${live.drift.currentPsi.toFixed(3)}${live.drift.threshold != null ? ` (threshold ${live.drift.threshold.toFixed(2)})` : ""} — ${live.drift.driftDetected ? "drift detected" : "no drift detected"}`}
                </dd>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
                The drift baseline is a self-check the ML service computes between two slices of the
                training dataset. It is not live monitoring: drift on production traffic is not yet
                measured.
              </p>
            </dl>
          )}
        </section>
  )
}
