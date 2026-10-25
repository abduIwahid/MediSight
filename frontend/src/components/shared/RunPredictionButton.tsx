"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Zap } from "lucide-react"
import type { PatientRow } from "@/lib/types"
import { buildMLPayload } from "@/lib/prediction-features"

interface RunPredictionButtonProps {
  patient: PatientRow
}

export function RunPredictionButton({ patient }: RunPredictionButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleRunPrediction = async () => {
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      const mlPayload = buildMLPayload(patient)

      const mlRes = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mlPayload),
      })

      if (!mlRes.ok) {
        const errBody = await mlRes.json().catch(() => null)
        throw new Error(errBody?.error || "Prediction request failed")
      }

      const prediction = await mlRes.json()

      const { error: predErr } = await supabase.from("predictions").insert({
        patient_id: patient.id,
        disease: prediction.disease || "Diabetes",
        probability: prediction.probability,
        severity: prediction.severity,
        confidence: prediction.confidence,
        model_version: prediction.model_version,
      })

      if (predErr) throw new Error(`Save error: ${predErr.message}`)

      if (prediction.severity === "High" || prediction.severity === "Critical") {
        await supabase.from("alerts").insert({
          patient_id: patient.id,
          type: `${prediction.severity} Diabetes Risk`,
          severity: prediction.severity,
          status: "New",
        })
      }

      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Prediction failed. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleRunPrediction}
        disabled={loading}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Running AI Model...
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            Run AI Prediction
          </>
        )}
      </button>
      {error && (
        <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
