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

  const { data: patient } = await supabase
    .from('patients')
    .select(`
      *,
      vitals(*),
      lab_results(*),
      diagnoses(*),
      predictions(*)
    `)
    .eq('id', params.id)
    .single()

  if (!patient) return notFound()

  const profile = await getCurrentProfile()

  const isAdmin = Boolean(profile?.role && ['super_admin', 'hospital_admin', 'data_scientist'].includes(profile.role))

  // Get the latest prediction
  const latestPrediction = (patient.predictions?.sort((a: PredictionRow, b: PredictionRow) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]) ?? null

  return (
    <PatientDetailView 
      patient={patient} 
      latestPrediction={latestPrediction} 
      isAdmin={isAdmin}
    />
  )
}

