"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Zap } from "lucide-react"
import type { PatientRow } from "@/lib/types"
import { buildMLPayload } from "@/lib/prediction-features"
import { useStagedLoadingLabel } from "@/lib/use-staged-loading-label"
import { PatientRiskCard } from "@/components/shared/PatientRiskCard"
import { ShapFactorList, type ShapFeature } from "@/components/shared/ShapFactorList"

interface RunPredictionButtonProps {
  patient: PatientRow
}

interface RunResult {
  predictionId: string
  disease: string
  probability: number | null
  confidence: number | null
  severity: string
  shapPayload: ShapFeature[]
  clinicalExplanation: string | null
}

export function RunPredictionButton({ patient }: RunPredictionButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const loadingLabel = useStagedLoadingLabel(loading, "Running AI Model...")
  const supabase = createClient()

  const handleRunPrediction = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    setWarning(null)
    setResult(null)

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

      const { data: inserted, error: predErr } = await supabase
        .from("predictions")
        .insert({
          patient_id: patient.id,
          disease: prediction.disease || "Diabetes",
          probability: prediction.probability,
          severity: prediction.severity,
          confidence: prediction.confidence,
          model_version: prediction.model_version,
        })
        .select("id")
        .single()

      if (predErr) throw new Error(`Save error: ${predErr.message}`)

      // Captured from the in-hand /api/predict + /api/explain payloads
      // so the result below renders immediately — no router.refresh()
      // re-read of the whole patient page after every run.
      let savedShapPayload: ShapFeature[] = []
      let savedClinicalExplanation: string | null = null

      if (inserted?.id) {
        // Best-effort: snapshot the exact inputs this score was computed
        // from (predictions.features, migration 20261025200000), so the
        // what-if baseline and any later audit use the real payload
        // instead of re-deriving it from a since-edited record. A failure
        // here must not fail the run itself.
        const { error: featuresErr } = await supabase
          .from("predictions")
          .update({ features: mlPayload })
          .eq("id", inserted.id)
        if (featuresErr) {
          console.warn("Prediction feature snapshot was not stored:", featuresErr.message)
        }

        // Persist the SHAP explanation — the prediction detail page and
        // the printed report read it from the explanations table, and
        // until now nothing in the run flow ever wrote it. /predict
        // returns no explanation, so /explain is called with the same
        // payload. A failure is surfaced as a warning, never hidden:
        // the score exists, its explanation does not.
        try {
          const expRes = await fetch("/api/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mlPayload),
          })
          if (!expRes.ok) throw new Error("Explanation request failed")
          const explanation = await expRes.json()
          // The ML service returns shap_values as a {feature: impact}
          // dict; the stored format the detail page/report render is an
          // array of {feature, value, impact} rows (same shape as the
          // seeded explanations), so convert here using the payload that
          // was actually scored.
          const shapPayload = Object.entries(
            (explanation.shap_values ?? {}) as Record<string, number>
          ).map(([feature, impact]) => ({
            feature,
            value: (mlPayload as Record<string, number>)[feature] ?? null,
            impact: Number(impact),
          }))
          const { error: expErr } = await supabase.from("explanations").insert({
            prediction_id: inserted.id,
            shap_payload: shapPayload,
            clinical_explanation: explanation.clinical_explanation,
          })
          if (expErr) throw new Error(expErr.message)
          savedShapPayload = shapPayload
          savedClinicalExplanation = explanation.clinical_explanation ?? null
        } catch {
          setWarning(
            "The prediction was saved, but its SHAP explanation could not be stored — the detail page will show this score without factor contributions."
          )
        }

        // Make sure this patient lands in the clinician's Risk Queue:
        // the queue reads doctor_patient_assignments, and this insert is
        // best-effort (a duplicate assignment or an RLS refusal is not
        // the user's problem to see).
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user && patient.hospital_id) {
          await supabase.from("doctor_patient_assignments").insert({
            doctor_id: user.id,
            patient_id: patient.id,
            hospital_id: patient.hospital_id,
          })
        }
      }

      if (prediction.severity === "High" || prediction.severity === "Critical") {
        await supabase.from("alerts").insert({
          patient_id: patient.id,
          type: `${prediction.severity} Diabetes Risk`,
          severity: prediction.severity,
          status: "New",
        })
      }

      // Render the just-run result from the payloads already in hand
      // (score + explanation + the saved row's id for the detail link)
      // instead of router.refresh() re-fetching the whole page.
      if (inserted?.id) {
        setResult({
          predictionId: inserted.id,
          disease: prediction.disease || "Diabetes",
          probability: prediction.probability ?? null,
          confidence: prediction.confidence ?? null,
          severity: prediction.severity,
          shapPayload: savedShapPayload,
          clinicalExplanation: savedClinicalExplanation,
        })
      }
      setLoading(false)
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
            {loadingLabel}
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            Run AI Prediction
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {warning && (
        <p role="alert" className="rounded-lg border border-[#D97706]/30 bg-[#FDF0DC] px-3 py-2 text-xs text-[#A85008]">
          {warning}
        </p>
      )}
      {result && (
        <div className="space-y-3 pt-1">
          <PatientRiskCard
            disease={result.disease}
            probability={result.probability}
            confidence={result.confidence}
            severity={result.severity}
            patientId={patient.id}
            predictionId={result.predictionId}
          />
          {result.shapPayload.length > 0 && (
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <h4 className="mb-3 text-sm font-bold">Why this score — top factors</h4>
              <ShapFactorList data={result.shapPayload} />
              {result.clinicalExplanation && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {result.clinicalExplanation}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
