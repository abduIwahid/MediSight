import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { Stethoscope } from "lucide-react"
import { DoctorDetailView, type DoctorDetailRow } from "@/components/shared/DoctorDetailView"
import { EmptyState } from "@/components/shared/EmptyState"

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
    .select('id, full_name, specialty, phone, email, department, hospital_id, hospitals(name), avatar_url, bio, available, consultation_fee, services')
    .eq('id', params.id)
    .single()

  if (error) {
    console.error('Doctor profile error:', error)
  }

  // No fallback data: a profile that does not exist gets an honest
  // not-found state, never sample data presented as a real doctor.
  if (!doctor) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="Doctor profile not found"
        description="This profile may have been removed, or the link is incorrect. Browse the directory to find an available doctor."
        actionLabel="Back to doctors"
        actionHref="/doctors"
        className="mx-auto max-w-xl"
      />
    )
  }

  return <DoctorDetailView doctor={{ ...doctor, name: doctor.full_name } as unknown as DoctorDetailRow} />
}
