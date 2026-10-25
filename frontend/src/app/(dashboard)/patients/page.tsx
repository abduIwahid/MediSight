import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { PatientListView } from "@/components/shared/PatientListView"
import { getCurrentProfile } from "@/lib/current-profile"
import type { PatientRow } from "@/lib/types"

export const dynamic = 'force-dynamic'

export default async function PatientListPage({
  searchParams,
}: {
  searchParams?: { search?: string }
}) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const search = (searchParams?.search || "").trim()

  // Default view: the 25 most recent records, filtered client-side.
  // With a search term, the search runs SERVER-side (MRN match, plus the
  // name stored in demographics) so matches beyond the first 25 rows are
  // found too — the client filter then refines by its name conventions.
  let patientsQuery = supabase
    .from('patients')
    .select(`
      id,
      mrn,
      demographics,
      created_at,
      hospitals(name),
      predictions(severity, probability, disease, created_at)
    `)
    .order('created_at', { ascending: false })

  if (search) {
    const term = search.replace(/[%_,()]/g, " ").trim()
    patientsQuery = patientsQuery
      .or(`mrn.ilike.%${term}%,demographics->>full_name.ilike.%${term}%,demographics->>name.ilike.%${term}%`)
      .limit(200)
  } else {
    patientsQuery = patientsQuery.limit(25)
  }

  // The viewer's profile (for the isAdmin flag) loads in parallel with
  // the patient list, through the shared per-request helper.
  const [{ data: patients, error }, profile] = await Promise.all([
    patientsQuery,
    getCurrentProfile()
  ])

  const isAdmin = Boolean(profile?.role && ['super_admin', 'hospital_admin', 'data_scientist'].includes(profile.role))

  if (error) {
    console.error("Supabase Error fetching patients:", error)
    return (
      <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-destructive">
        <h2 className="font-bold">The patient registry could not be loaded</h2>
        <p className="text-sm">Please reload the page to try again.</p>
      </div>
    )
  }

  return <PatientListView patients={(patients || []) as unknown as PatientRow[]} initialSearch={search} isAdmin={isAdmin} />
}
