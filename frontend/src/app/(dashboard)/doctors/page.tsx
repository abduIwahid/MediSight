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

  // The directory lists APPROVED doctors only (QA Round 1, item 31):
  // the inner join to the doctors table with status = 'approved' keeps
  // pending and rejected sign-ups out. Availability comes from the one
  // source of truth, profiles.availability_status.
  const { data: doctors, error } = await supabase
    .from('profiles')
    .select('id, full_name, specialty, contact_number, email, department, hospital_id, hospitals(name), avatar_url, bio, availability_status, consultation_fee, services, doctors!inner(status)')
    .eq('role', 'doctor')
    .eq('doctors.status', 'approved')
    .order('full_name', { ascending: true })

  if (error) {
    console.error('Error loading doctors:', error)
    return (
      <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-destructive-text">
        <h2 className="font-bold">The doctor directory could not be loaded</h2>
        <p className="text-sm">Please reload the page to try again.</p>
      </div>
    )
  }

  const normalizedDoctors = ((doctors || []) as unknown as ProfileRow[]).map((doctor) => ({
    ...doctor,
    name: doctor.full_name,
  }))

  // An empty directory renders the view's own EmptyState (which says
  // what happens next) instead of a page-level dead end.
  return <DoctorListView doctors={normalizedDoctors} />
}
