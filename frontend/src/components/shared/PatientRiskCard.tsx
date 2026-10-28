"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { RiskBadge, RiskSeverity } from "./RiskBadge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface PatientRiskCardProps {
  disease: string
  /** Null when no value was stored — rendered as "Not recorded",
   *  never as a defaulted 0% (QA Round 1, item 90). */
  probability: number | null
  confidence: number | null
  severity: RiskSeverity | string
  patientId: string
  predictionId: string
}

function getRecommendedDoctor(disease: string, severity: string) {
  const base = disease?.toLowerCase().includes("diabetes") ? "Endocrinologist" : "Primary Care Physician"
  if (severity === "Critical") return `${base} or Emergency Specialist`
  // One name for the same role everywhere (QA Round 3, copy M6): the
  // Low band used to say "General Practitioner" while the rest of the
  // product says "Primary Care Physician".
  return base
}

export function PatientRiskCard({ disease, probability, confidence, severity, patientId, predictionId }: PatientRiskCardProps) {
  const recommended = getRecommendedDoctor(disease, String(severity))
  // A missing disease is "Unrecorded", never silently "Diabetes"
  // (QA Round 3, patient-portal F7) — and percentages are clamped to
  // the range a probability can actually take.
  const displayDisease = disease?.trim() ? disease : "Unrecorded"
  const clampPct = (v: number) => Math.min(100, Math.max(0, v * 100))

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg font-semibold">{displayDisease} Risk</CardTitle>
            <CardDescription>Current Assessment</CardDescription>
          </div>
          <RiskBadge severity={severity} className="text-sm px-2 py-0.5" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mt-2">
          <div>
            <div className="text-sm text-muted-foreground">Probability</div>
            <div className="text-2xl font-bold">{probability != null ? `${clampPct(probability).toFixed(1)}%` : "Not recorded"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Confidence</div>
            <div className="text-2xl font-medium">{confidence != null ? `${clampPct(confidence).toFixed(1)}%` : "Not recorded"}</div>
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Confidence is the probability the model assigns to the class it predicted — not a calibrated accuracy estimate.
        </p>

        <div className="rounded-xl border border-border/70 bg-muted/50 p-4 mt-6 text-sm">
          <div className="text-muted-foreground text-xs uppercase tracking-[0.18em] mb-2">Recommended Care</div>
          <p className="font-semibold">{recommended}</p>
          <p className="mt-1 text-xs text-muted-foreground">Rule-based suggestion from the severity band — confirm with the care team.</p>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          WhyRisk is an experimental screening aid. It does not diagnose, and it is not a certified medical device.
        </p>

        {predictionId ? (
          <div className="mt-6">
            <Button asChild className="w-full" variant="outline">
              <Link href={`/patients/${patientId}/predictions/${predictionId}`}>
                View Explainability (SHAP)
              </Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
