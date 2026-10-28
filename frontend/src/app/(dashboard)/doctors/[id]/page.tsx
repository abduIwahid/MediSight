import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { DoctorDetailView, type DoctorDetailRow } from "@/components/shared/DoctorDetailView"

export const dynamic = 'force-dynamic'

export default async function DoctorDetailPage({ params }: { params: { id: string } }) {
  if (!params?.id) return notFound()

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const { data: doctor, error } = await supabase
    .from('profiles')
    .select('id, full_name, specialty, contact_number, email, department, hospital_id, hospitals(name), avatar_url, bio, availability_status, consultation_fee, services')
    .eq('id', params.id)
    .eq('role', 'doctor')
    .single()

  // A load failure is not a 404 (QA Round 3, states F-07).
  if (error && error.code !== 'PGRST116') {
    console.error('Doctor profile error:', error)
    return (
      <div role="alert" className="mx-auto max-w-xl rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-destructive-text">
        <h2 className="font-bold">This profile could not be loaded</h2>
        <p className="text-sm">Please reload the page to try again.</p>
      </div>
    )
  }

  // No fallback data: a profile that does not exist gets the real
  // not-found page, never sample data presented as a real doctor
  // (QA Round 3, states F-07/F-16).
  if (!doctor) return notFound()

  return <DoctorDetailView doctor={{ ...doctor, name: doctor.full_name } as unknown as DoctorDetailRow} />
}
