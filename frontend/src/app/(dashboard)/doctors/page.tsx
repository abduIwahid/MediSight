import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { DoctorListView } from "@/components/shared/DoctorListView"
import type { ProfileRow } from "@/lib/types"

export const dynamic = 'force-dynamic'

export default async function DoctorsPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const { data: doctors, error } = await supabase
    .from('profiles')
    .select('id, full_name, specialty, phone, email, department, hospital_id, hospitals(name), avatar_url, bio, available, consultation_fee, services')
    .eq('role', 'doctor')
    .order('full_name', { ascending: true })

  if (error) {
    console.error('Error loading doctors:', error)
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-destructive">
        <h2 className="font-bold">Error loading doctor directory</h2>
        <p className="text-sm">{error.message}</p>
      </div>
    )
  }

  const normalizedDoctors = ((doctors || []) as unknown as ProfileRow[]).map((doctor) => ({
    ...doctor,
    name: doctor.full_name,
  }))

  // Show real doctors only; if none exist, display a friendly message
  if (normalizedDoctors.length === 0) {
    return (
      <div className="rounded-xl border border-muted/20 bg-muted/10 p-6 text-muted-foreground">
        <h2 className="font-bold">No doctors found</h2>
        <p className="text-sm">The directory is currently empty. Please add doctor profiles.</p>
      </div>
    )
  }

  return <DoctorListView doctors={normalizedDoctors} />
}
