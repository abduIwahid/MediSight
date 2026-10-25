"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, RotateCcw, SlidersHorizontal } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RiskBadge } from "@/components/shared/RiskBadge"
import type { MLFeaturePayload } from "@/lib/prediction-features"

interface WhatIfSimulatorProps {
  /** The exact feature payload the stored prediction was generated with. */
  baseline: MLFeaturePayload
  /** The stored prediction's probability (0-1) the simulation compares against. */
  originalProbability: number
  originalSeverity: string
}

interface SimResult {
  probability: number
  severity: string
}

const GEN_HLTH_LABELS: Record<number, string> = {
  1: "Excellent",
  2: "Very good",
  3: "Good",
  4: "Fair",
  5: "Poor",
}

/**
 * "What would lower this risk?" — every simulated score is produced by
 * re-running the REAL model through /api/predict with one or more inputs
 * changed. Nothing is estimated in the browser. If the ML service is
 * unavailable the simulator says so, exactly like the prediction flow.
 * Simulations are exploratory and are never saved to the patient record.
 */
export function WhatIfSimulator({ baseline, originalProbability, originalSeverity }: WhatIfSimulatorProps) {
  const [bmi, setBmi] = useState(baseline.BMI)
  const [physActivity, setPhysActivity] = useState(baseline.PhysActivity)
  const [highBP, setHighBP] = useState(baseline.HighBP)
  const [genHlth, setGenHlth] = useState(baseline.GenHlth)

  const [result, setResult] = useState<SimResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const changed =
    bmi !== baseline.BMI ||
    physActivity !== baseline.PhysActivity ||
    highBP !== baseline.HighBP ||
    genHlth !== baseline.GenHlth

  useEffect(() => {
    if (!changed) {
      setResult(null)
      setUnavailable(false)
      setError(null)
      setLoading(false)
      return
    }

    const id = ++requestId.current
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...baseline, BMI: bmi, PhysActivity: physActivity, HighBP: highBP, GenHlth: genHlth }),
        })
        if (requestId.current !== id) return

        if (res.status === 503) {
          setUnavailable(true)
          setResult(null)
          setError(null)
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error || "Simulation request failed")
        }
        const data = await res.json()
        setResult({ probability: data.probability, severity: data.severity })
        setUnavailable(false)
        setError(null)
      } catch (err: unknown) {
        if (requestId.current !== id) return
        setError(err instanceof Error ? err.message : "Simulation failed. Please try again.")
        setResult(null)
      } finally {
        if (requestId.current === id) setLoading(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [bmi, physActivity, highBP, genHlth, changed, baseline])

  const reset = () => {
    setBmi(baseline.BMI)
    setPhysActivity(baseline.PhysActivity)
    setHighBP(baseline.HighBP)
    setGenHlth(baseline.GenHlth)
  }

  const delta = result ? result.probability - originalProbability : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-brand" />
          What would change this score?
        </CardTitle>
        <CardDescription>
          Adjust a factor and the model re-runs on the spot — the new score is a real model output, not an
          estimate. Simulations are exploratory and are not saved to the patient record.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <label htmlFor="whatif-bmi" className="font-medium">BMI</label>
                <span className="font-mono text-xs text-muted-foreground">
                  {bmi.toFixed(1)} (recorded: {baseline.BMI.toFixed(1)})
                </span>
              </div>
              <input
                id="whatif-bmi"
                type="range"
                min={15}
                max={55}
                step={0.1}
                value={bmi}
                onChange={(e) => setBmi(parseFloat(e.target.value))}
                className="w-full"
                style={{ accentColor: "#2E7FA8" }}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium">General health</span>
                <span className="font-mono text-xs text-muted-foreground">{GEN_HLTH_LABELS[genHlth]}</span>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setGenHlth(level)}
                    className={`h-9 flex-1 rounded-lg border text-sm font-medium transition-colors ${
                      genHlth === level
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-secondary"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>Excellent</span>
                <span>Poor</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPhysActivity(physActivity === 1 ? 0 : 1)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  physActivity === 1 ? "border-primary bg-secondary" : "border-border bg-background hover:bg-secondary"
                }`}
              >
                <span className="block text-sm font-medium">Physically active</span>
                <span className="block text-xs text-muted-foreground">{physActivity === 1 ? "Yes" : "No"}</span>
              </button>
              <button
                type="button"
                onClick={() => setHighBP(highBP === 1 ? 0 : 1)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  highBP === 1 ? "border-primary bg-secondary" : "border-border bg-background hover:bg-secondary"
                }`}
              >
                <span className="block text-sm font-medium">High blood pressure</span>
                <span className="block text-xs text-muted-foreground">{highBP === 1 ? "Yes" : "No"}</span>
              </button>
            </div>

            {changed && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset to recorded values
              </button>
            )}
          </div>

          <div className="flex flex-col justify-center rounded-xl border border-border bg-background p-5">
            {!changed && (
              <div>
                <p className="text-sm text-muted-foreground">Recorded score</p>
                <p className="font-display text-4xl leading-tight">
                  {(originalProbability * 100).toFixed(1)}
                  <span className="font-sans text-sm font-semibold text-muted-foreground">%</span>
                </p>
                <div className="mt-2">
                  <RiskBadge severity={originalSeverity} />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Move a control to see how the model scores this patient with that change.
                </p>
              </div>
            )}

            {changed && loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Re-running the model…
              </div>
            )}

            {changed && !loading && unavailable && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                Prediction service unavailable. No score was generated.
              </div>
            )}

            {changed && !loading && error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {changed && !loading && result && delta !== null && (
              <div>
                <p className="text-sm text-muted-foreground">Simulated score</p>
                <p className="font-display text-4xl leading-tight">
                  {(result.probability * 100).toFixed(1)}
                  <span className="font-sans text-sm font-semibold text-muted-foreground">%</span>
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <RiskBadge severity={result.severity} />
                  <span
                    className="font-mono text-sm font-semibold"
                    style={{ color: delta < 0 ? "#1E7A46" : delta > 0 ? "#C0392B" : undefined }}
                  >
                    {delta > 0 ? "+" : ""}
                    {(delta * 100).toFixed(1)} pts vs recorded
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Same model, same patient — only the factors you changed are different.
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
