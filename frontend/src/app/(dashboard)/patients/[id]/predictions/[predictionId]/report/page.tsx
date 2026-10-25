import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ShapFactorList } from "@/components/shared/ShapFactorList"
import BrandMark from "@/components/shared/BrandMark"
import { PrintButton } from "@/components/shared/PrintButton"
import type { PatientRow } from "@/lib/types"

export const dynamic = "force-dynamic"

const SEVERITY_TEXT_COLOR: Record<string, string> = {
  Low: "#1E7A46",
  Moderate: "#D97706",
  High: "#C0392B",
  Critical: "#C0392B",
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—"
  // Same convention as the rest of the product: Asia/Karachi, stated
  // explicitly so the server-rendered report matches the client views.
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Karachi" })
}

/**
 * One-page, print-optimised patient risk report. Everything on it comes
 * from the stored prediction, its stored explanation, and the patient
 * record — if something was not stored, the report says so instead of
 * filling the gap. Use the browser's "Save as PDF" to download it.
 */
export default async function PredictionReportPage({ params }: { params: { id: string; predictionId: string } }) {
  if (!params?.id || !params?.predictionId) return notFound()

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const { data: prediction } = await supabase
    .from("predictions")
    .select(`
      *,
      patients (
        *,
        vitals (*),
        hospitals (name)
      ),
      explanations (*)
    `)
    .eq("id", params.predictionId)
    .single()

  // The prediction must belong to the patient in the URL.
  if (!prediction || prediction.patient_id !== params.id) return notFound()

  const patient = prediction.patients as unknown as PatientRow | null

  // Issuing line data — real records only: the patient's hospital, and
  // the signed-in clinician generating this report.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: generatorProfile } = user
    ? await supabase.from("profiles").select("full_name").eq("id", user.id).single()
    : { data: null }
  const hospitalName = (patient as unknown as { hospitals?: { name: string } | null } | null)?.hospitals?.name || null
  const generatedBy = generatorProfile?.full_name || null
  const explanation = prediction.explanations?.[0] as { shap_payload?: unknown; clinical_explanation?: string } | undefined

  let shapPayload: { feature: string; value: string | number; impact: number }[] = []
  if (explanation?.shap_payload) {
    try {
      shapPayload = typeof explanation.shap_payload === "string"
        ? JSON.parse(explanation.shap_payload)
        : explanation.shap_payload
    } catch (e) {
      console.error("Failed to parse SHAP payload", e)
    }
  }

  const d = patient?.demographics || {}
  const patientName =
    d.full_name || d.name || `${d.first_name || ""} ${d.last_name || ""}`.trim() || "Unknown Patient"
  const dobRaw = d.birth_date || d.dob
  const age = d.age || (
    dobRaw
      ? Math.floor((Date.now() - new Date(dobRaw).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null
  )
  const gender = d.gender ? d.gender.charAt(0).toUpperCase() + d.gender.slice(1).toLowerCase() : null

  const vitals = patient?.vitals || []
  const latestOf = (needle: string) =>
    [...vitals]
      .filter((v) => v.type?.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.recorded_at || 0).getTime() - new Date(a.recorded_at || 0).getTime())[0]
  const bmiVital = latestOf("bmi")
  const bpVital = latestOf("systolic") || latestOf("blood pressure")

  const indicators: { label: string; value: string }[] = []
  if (bmiVital) indicators.push({ label: "BMI (latest recorded)", value: `${bmiVital.value}${bmiVital.unit ? ` ${bmiVital.unit}` : ""}` })
  if (bpVital) indicators.push({ label: "Systolic blood pressure (latest recorded)", value: `${bpVital.value}${bpVital.unit ? ` ${bpVital.unit}` : ""}` })
  if (age != null) indicators.push({ label: "Age", value: `${age} years` })
  if (gender) indicators.push({ label: "Sex", value: gender })

  // Missing values print as "Not recorded" — never a defaulted 0% or
  // "Low" on a clinical document (QA Round 1, item 90).
  const probability = prediction.probability ?? null
  const severity = prediction.severity ?? null

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <div className="print-hidden flex items-center justify-between gap-4">
        <Link
          href={`/patients/${params.id}/predictions/${params.predictionId}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to prediction detail
        </Link>
        <PrintButton />
      </div>

      <article className="print-report rounded-2xl border bg-card p-8 shadow-sm">
        <header className="flex items-start justify-between gap-6 border-b border-border pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark className="h-9 w-9 shrink-0" />
              <p className="font-display text-2xl uppercase tracking-wide">WhyRisk</p>
            </div>
            <p className="eyebrow mt-1">Patient risk report</p>
          </div>
          <div className="text-right text-xs leading-relaxed text-muted-foreground">
            <p>Assessment date: {fmtDate(prediction.created_at)}</p>
            <p>Report generated: {fmtDate(new Date().toISOString())}</p>
            <p>Model version: {prediction.model_version || "—"}</p>
          </div>
        </header>

        <section className="grid gap-6 border-b border-border py-5 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Patient</h2>
            <p className="mt-2 text-lg font-bold">{patientName}</p>
            <p className="font-mono text-xs text-muted-foreground">MRN: {patient?.mrn || "—"}</p>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {prediction.disease || "Diabetes"} risk assessment
            </h2>
            {probability !== null ? (
              <p className="mt-2 font-display text-5xl leading-none">
                {(probability * 100).toFixed(1)}
                <span className="font-sans text-base font-semibold text-muted-foreground">%</span>
              </p>
            ) : (
              <p className="mt-2 text-xl font-semibold">Score not recorded</p>
            )}
            <p className="mt-1.5 text-sm">
              Severity:{" "}
              {severity ? (
                <span className="font-bold" style={{ color: SEVERITY_TEXT_COLOR[severity] ?? "#06141B" }}>
                  {severity}
                </span>
              ) : (
                <span className="font-bold">Not recorded</span>
              )}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {prediction.confidence != null
                ? `Model confidence ${(prediction.confidence * 100).toFixed(1)}% — the probability the model assigns to the class it predicted, not a calibrated accuracy estimate.`
                : "Model confidence was not recorded for this assessment."}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Bands: Low under 0.20 · Moderate 0.20–0.49 · High 0.50–0.79 · Critical 0.80 and above.
            </p>
          </div>
        </section>

        {indicators.length > 0 && (
          <section className="border-b border-border py-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Clinical indicators on record</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {indicators.map((ind) => (
                <div key={ind.label} className="flex items-baseline justify-between gap-4 rounded-lg bg-background px-4 py-2.5">
                  <dt className="text-sm text-muted-foreground">{ind.label}</dt>
                  <dd className="font-mono text-sm font-semibold">{ind.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="border-b border-border py-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Why this score — top factors</h2>
          <div className="mt-3">
            <ShapFactorList data={shapPayload} />
          </div>
        </section>

        <section className="border-b border-border py-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Clinical explanation</h2>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {explanation?.clinical_explanation ||
              "No clinical explanation was stored for this prediction."}
          </p>
        </section>

        <footer className="pt-5">
          {(hospitalName || generatedBy) && (
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              Issued by {hospitalName || "WhyRisk"}
              {generatedBy ? ` · Report generated by ${generatedBy}` : ""} · {fmtDate(new Date().toISOString())}
            </p>
          )}
          <p className="max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
            WhyRisk is an experimental clinical decision-support and research tool. It is not a certified
            medical device and does not replace professional diagnosis. This report summarises a model
            estimate and its explanation; clinical decisions must be made by a qualified healthcare
            professional using the full patient record.
          </p>
        </footer>
      </article>
    </div>
  )
}
