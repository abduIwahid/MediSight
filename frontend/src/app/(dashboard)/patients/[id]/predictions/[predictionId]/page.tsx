import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { PredictionDetailView } from "@/components/shared/PredictionDetailView"
import type { PatientRow } from "@/lib/types"

export const dynamic = 'force-dynamic'

export default async function PredictionDetailPage({ params }: { params: { id: string, predictionId: string } }) {
  if (!params || !params.id || !params.predictionId) return notFound()

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const { data: prediction, error: predictionError } = await supabase
    .from('predictions')
    .select(`
      *,
      patients (
        *,
        vitals (*),
        diagnoses (*)
      ),
      explanations (*)
    `)
    // Cap the nested vitals embed (QA Round 2, cluster 30) — the
    // payload builder reads the latest values, not the full history.
    .order('recorded_at', { referencedTable: 'patients.vitals', ascending: false })
    .limit(200, { referencedTable: 'patients.vitals' })
    .eq('id', params.predictionId)
    .single()

  // A load failure is not a 404 (QA Round 3, states F-07).
  if (predictionError && predictionError.code !== 'PGRST116') {
    console.error("Prediction detail failed to load:", predictionError)
    return (
      <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-destructive-text">
        <h2 className="font-bold">This assessment could not be loaded</h2>
        <p className="text-sm">Please reload the page to try again.</p>
      </div>
    )
  }

  // The prediction must belong to the patient in the URL — a mismatched
  // pair is a not-found, not a view of someone else's assessment.
  if (!prediction || prediction.patient_id !== params.id) return notFound()

  const patient = prediction.patients as unknown as PatientRow | null
  const explanation = prediction.explanations?.[0] as { shap_payload?: unknown; clinical_explanation?: string } | undefined

  // Only the explanation actually stored with this prediction may be
  // shown. If none was stored, the view says so — sample SHAP values or
  // template text must never stand in for a real explanation.
  // The stored shape must be the array the views render: the column's
  // own default is an object ({}), and legacy rows may hold the ML
  // service's native {feature: impact} dict. A dict converts (values
  // from this prediction's stored feature snapshot); anything else
  // degrades to "not recorded" instead of crashing the view
  // (QA Round 2, cluster 9).
  let shapPayload: { feature: string; value: string | number; impact: number }[] = []
  if (explanation?.shap_payload) {
    try {
      const parsed = typeof explanation.shap_payload === 'string'
        ? JSON.parse(explanation.shap_payload)
        : explanation.shap_payload
      if (Array.isArray(parsed)) {
        shapPayload = parsed
      } else if (parsed && typeof parsed === 'object') {
        const features = (prediction.features ?? {}) as Record<string, number>
        shapPayload = Object.entries(parsed as Record<string, number>)
          .filter(([, impact]) => Number.isFinite(Number(impact)))
          .map(([feature, impact]) => ({
            feature,
            value: features[feature] ?? null,
            impact: Number(impact),
          }))
      }
    } catch (e) {
      console.error("Failed to parse SHAP payload", e)
    }
  }

  const clinicalExplanation = explanation?.clinical_explanation || ""

  return (
    <PredictionDetailView
      prediction={prediction}
      patient={patient}
      shapPayload={shapPayload}
      clinicalExplanation={clinicalExplanation}
      patientId={params.id}
    />
  )
}

