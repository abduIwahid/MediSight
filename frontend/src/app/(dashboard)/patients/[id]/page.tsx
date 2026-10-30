import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { PatientDetailView } from "@/components/shared/PatientDetailView"
import { getCurrentProfile } from "@/lib/current-profile"
import type { PredictionRow } from "@/lib/types"

export const dynamic = 'force-dynamic'

export default async function PatientDetailPage({ params }: { params: { id: string } }) {
  if (!params || !params.id) return notFound()

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  // Embedded histories are ordered newest-first and capped (QA Round
  // 2, cluster 30): they were unbounded — every vital, lab and
  // prediction the patient ever had shipped with the page. The view
  // displays the latest 8 vitals/labs and the recent prediction
  // history; the caps sit far above those display windows.
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select(`
      *,
      vitals(*),
      lab_results(*),
      diagnoses(*),
      predictions(*)
    `)
    .eq('id', params.id)
    .order('recorded_at', { referencedTable: 'vitals', ascending: false })
    .limit(200, { referencedTable: 'vitals' })
    .order('recorded_at', { referencedTable: 'lab_results', ascending: false })
    .limit(200, { referencedTable: 'lab_results' })
    .order('created_at', { referencedTable: 'predictions', ascending: false })
    .limit(100, { referencedTable: 'predictions' })
    .single()

  // Only a genuine no-row result is a 404 (QA Round 3, states F-07):
  // any other failure (network, RLS, embed error) renders an error
  // panel — telling a clinician a real patient "doesn't exist" is the
  // worst available lie.
  if (patientError && patientError.code !== 'PGRST116') {
    console.error("Patient detail failed to load:", patientError)
    return (
      <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-destructive-text">
        <h2 className="font-bold">This patient record could not be loaded</h2>
        <p className="text-sm">Please reload the page to try again.</p>
      </div>
    )
  }
  if (!patient) return notFound()

  const profile = await getCurrentProfile()

  const isAdmin = Boolean(profile?.role && ['super_admin', 'hospital_admin', 'data_scientist'].includes(profile.role))
  // Doctors can edit demographics (their update policy allows it) —
  // they were the one role doing daily corrections with no UI at all
  // (QA Round 3, patients-crud M7). Deleting stays admin-only.
  const canEdit = Boolean(profile?.role && ['super_admin', 'hospital_admin', 'data_scientist', 'doctor'].includes(profile.role))
  // Vitals writes follow the vitals RLS policies exactly (doctor,
  // hospital_admin, super_admin) — data scientists and nurses can read
  // vitals but have no write policy, so they never see the form.
  const canAddVitals = Boolean(profile?.role && ['super_admin', 'hospital_admin', 'doctor'].includes(profile.role))

  // Get the latest prediction
  const latestPrediction = (patient.predictions?.sort((a: PredictionRow, b: PredictionRow) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]) ?? null

  return (
    <PatientDetailView
      patient={patient}
      latestPrediction={latestPrediction}
      isAdmin={isAdmin}
      canEdit={canEdit}
      canAddVitals={canAddVitals}
    />
  )
}

