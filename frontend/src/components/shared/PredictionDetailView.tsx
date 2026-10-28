"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ShapFactorList, ShapFeature } from "@/components/shared/ShapFactorList"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { WhatIfSimulator } from "@/components/shared/WhatIfSimulator"
import { InputsUsedDisclosure } from "@/components/shared/InputsUsedDisclosure"
import { buildMLPayload, FEATURE_NAMES, type MLFeaturePayload } from "@/lib/prediction-features"
import { severityChartColor } from "@/lib/status"
import type { PatientRow, PredictionRow } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface PredictionDetailViewProps {
  prediction: PredictionRow
  patient: PatientRow | null
  shapPayload: ShapFeature[]
  clinicalExplanation: string
  patientId: string
}

// Gauge colours are the canonical severity fills from lib/status.ts.
const SEVERITY_GAUGE_COLOR = severityChartColor

export function PredictionDetailView({
  prediction,
  patient,
  shapPayload,
  clinicalExplanation,
  patientId
}: PredictionDetailViewProps) {
  // A missing value is "not recorded" — never a defaulted 0% or "Low",
  // which would read as a confident low-risk result (QA Round 1, item 90).
  const probability = prediction.probability ?? null
  const severity = prediction.severity ?? "Unknown"
  const gaugeColor = SEVERITY_GAUGE_COLOR[severity] ?? "#2E7FA8"
  const patientName = patient?.demographics?.full_name || patient?.demographics?.name ||
    `${patient?.demographics?.first_name || ""} ${patient?.demographics?.last_name || ""}`.trim() || "Unknown Patient"

  // The payload this prediction was generated with. The run flows
  // snapshot it into predictions.features — when that snapshot exists
  // it IS the baseline (the what-if comparison and the inputs
  // disclosure must describe the scored inputs, not today's record).
  // Legacy rows without a snapshot fall back to re-deriving from the
  // current record, and the disclosure says so (QA Round 2, cluster 4).
  const derived = useMemo(() => (patient ? buildMLPayload(patient) : null), [patient])
  const snapshot = useMemo<MLFeaturePayload | null>(() => {
    const raw = prediction.features
    if (!raw || typeof raw !== "object") return null
    const out = {} as Record<string, number>
    for (const name of FEATURE_NAMES) {
      const v = (raw as Record<string, unknown>)[name]
      if (typeof v !== "number" || !Number.isFinite(v)) return null
      out[name] = v
    }
    return out as MLFeaturePayload
  }, [prediction.features])
  const baseline = snapshot ?? derived?.payload ?? null

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/patients/${patientId}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <p className="eyebrow">Prediction detail</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Why this score</h1>
          <p className="text-muted-foreground">
            Patient: {patientName} | MRN: {patient?.mrn}
          </p>
        </div>
        <Button variant="outline" className="shrink-0" asChild>
          <Link href={`/patients/${patientId}/predictions/${prediction.id}/report`}>
            <Printer className="mr-2 h-4 w-4" />
            Download report
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assessment Summary</CardTitle>
              <CardDescription>{prediction.disease} Risk</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Risk probability</div>
                {probability !== null ? (
                  <>
                    <div className="font-display text-5xl leading-none">
                      {(probability * 100).toFixed(1)}
                      <span className="font-sans text-base font-semibold text-muted-foreground">%</span>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, Math.max(0, probability * 100))}%`, background: gaugeColor }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
                      <span>LOW</span>
                      <span>MODERATE</span>
                      <span>HIGH</span>
                      <span>CRITICAL</span>
                    </div>
                  </>
                ) : (
                  <div className="text-xl font-medium">Not recorded</div>
                )}
                {/* The severity bands the ML service assigns, shown where
                    the score is read (QA Round 1, item 60). */}
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Bands: Low under 0.20 · Moderate 0.20–0.49 · High 0.50–0.79 · Critical 0.80 and above.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Severity</span>
                <RiskBadge severity={severity} />
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Model confidence</div>
                <div className="text-xl font-medium">{prediction.confidence != null ? `${(prediction.confidence * 100).toFixed(1)}%` : "Not recorded"}</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  The probability the model assigns to the class it predicted — not a calibrated accuracy estimate.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Clinical Explanation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {clinicalExplanation ||
                  "No clinical explanation was stored for this prediction."}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Why this score — top factors</CardTitle>
              <CardDescription>
                SHAP values showing how much each factor pushed this patient&apos;s predicted risk up or down,
                relative to the average patient.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ShapFactorList data={shapPayload} />
              <p className="mt-6 border-t border-secondary pt-3 text-xs leading-relaxed text-muted-foreground">
                Explanation generated with SHAP from the patient&apos;s own inputs. A screening aid — not a diagnosis.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {baseline && (
        <Card>
          <CardHeader>
            <CardTitle>Inputs used for this score</CardTitle>
            <CardDescription>
              {snapshot
                ? "Every model input, marked as recorded from this patient or filled with a population default."
                : "This prediction has no stored input snapshot, so the values below are derived from the patient's current record — today's record stands in for the scored inputs."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InputsUsedDisclosure
              payload={baseline}
              recordedFeatures={snapshot ? undefined : (derived?.recordedFeatures ?? [])}
              fromSnapshot={snapshot !== null}
            />
          </CardContent>
        </Card>
      )}

      {baseline && probability !== null && (
        <WhatIfSimulator
          key={prediction.id}
          baseline={baseline}
          originalProbability={probability}
          originalSeverity={severity}
          fromSnapshot={snapshot !== null}
        />
      )}
    </div>
  )
}
