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

  const { data: prediction } = await supabase
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
    .eq('id', params.predictionId)
    .single()

  // The prediction must belong to the patient in the URL — a mismatched
  // pair is a not-found, not a view of someone else's assessment.
  if (!prediction || prediction.patient_id !== params.id) return notFound()

  const patient = prediction.patients as unknown as PatientRow | null
  const explanation = prediction.explanations?.[0] as { shap_payload?: unknown; clinical_explanation?: string } | undefined

  // Only the explanation actually stored with this prediction may be
  // shown. If none was stored, the view says so — sample SHAP values or
  // template text must never stand in for a real explanation.
  let shapPayload = []
  if (explanation?.shap_payload) {
    try {
      shapPayload = typeof explanation.shap_payload === 'string'
        ? JSON.parse(explanation.shap_payload)
        : explanation.shap_payload
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

