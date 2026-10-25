"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ShapFactorList, ShapFeature } from "@/components/shared/ShapFactorList"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { WhatIfSimulator } from "@/components/shared/WhatIfSimulator"
import { buildMLPayload } from "@/lib/prediction-features"
import type { PatientRow, PredictionRow } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface PredictionDetailViewProps {
  prediction: PredictionRow
  patient: PatientRow | null
  shapPayload: ShapFeature[]
  clinicalExplanation: string
  patientId: string
}

const SEVERITY_GAUGE_COLOR: Record<string, string> = {
  Low: "#1E7A46",
  Moderate: "#D97706",
  High: "#C0392B",
  Critical: "#C0392B",
}

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

  // The exact payload this prediction was generated with, rebuilt from
  // the patient record by the same derivation the run flow uses.
  const baseline = useMemo(() => (patient ? buildMLPayload(patient) : null), [patient])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/patients/${patientId}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <p className="eyebrow">Prediction detail</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Why this score</h1>
          <p className="text-muted-foreground">
            Patient: {patientName} | MRN: {patient?.mrn}
          </p>
        </div>
        <Button variant="outline" asChild>
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

      {baseline && probability !== null && (
        <WhatIfSimulator
          baseline={baseline}
          originalProbability={probability}
          originalSeverity={severity}
        />
      )}
    </div>
  )
}
