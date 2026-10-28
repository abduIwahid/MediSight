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
    // The registry only reads each patient's LATEST prediction —
    // cap the embed instead of shipping full histories per row
    // (QA Round 2, cluster 30).
    .order('created_at', { referencedTable: 'predictions', ascending: false })
    .limit(10, { referencedTable: 'predictions' })

  if (search) {
    const term = search.replace(/[%_,()]/g, " ").trim()
    // Name matching must cover the fields the app actually writes: the
    // New Patient flow stores first_name/last_name in demographics.
    // A multi-word query ("Ayesha Khan") is split (QA Round 3,
    // patients-crud H3): each word gets its own .or() group, and
    // separate groups AND together — so one word can match first_name
    // while the other matches last_name. The old single-term filter
    // compared the whole string against each single field and could
    // never match an intake-created patient by full name.
    const words = term.split(/\s+/).filter(Boolean)
    if (words.length <= 1) {
      const w = words[0] || term
      patientsQuery = patientsQuery
        .or(`mrn.ilike.%${w}%,demographics->>full_name.ilike.%${w}%,demographics->>name.ilike.%${w}%,demographics->>first_name.ilike.%${w}%,demographics->>last_name.ilike.%${w}%`)
    } else {
      for (const w of words) {
        patientsQuery = patientsQuery
          .or(`demographics->>full_name.ilike.%${w}%,demographics->>name.ilike.%${w}%,demographics->>first_name.ilike.%${w}%,demographics->>last_name.ilike.%${w}%`)
      }
    }
    patientsQuery = patientsQuery.limit(200)
  } else {
    patientsQuery = patientsQuery.limit(25)
  }

  // The viewer's profile (for the capability flags) loads in parallel
  // with the patient list and the exact total, through the shared
  // per-request helper.
  const [{ data: patients, error }, profile, countRes] = await Promise.all([
    patientsQuery,
    getCurrentProfile(),
    supabase.from('patients').select('id', { count: 'exact', head: true }),
  ])

  const isAdmin = Boolean(profile?.role && ['super_admin', 'hospital_admin', 'data_scientist'].includes(profile.role))
  // Affordances follow what the database will actually accept
  // (QA Round 3, patients-crud M7): creating patients is a
  // doctor/admin capability — offering the flow to a nurse ended in a
  // raw RLS refusal at the final step; deleting is admin-only.
  const canCreate = Boolean(profile?.role && ['doctor', 'super_admin', 'hospital_admin'].includes(profile.role))
  const canDelete = Boolean(profile?.role && ['super_admin', 'hospital_admin'].includes(profile.role))

  if (error) {
    console.error("Supabase Error fetching patients:", error)
    return (
      <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-destructive-text">
        <h2 className="font-bold">The patient registry could not be loaded</h2>
        <p className="text-sm">Please reload the page to try again.</p>
      </div>
    )
  }

  return (
    <PatientListView
      patients={(patients || []) as unknown as PatientRow[]}
      initialSearch={search}
      isAdmin={isAdmin}
      totalCount={countRes.count ?? (patients || []).length}
      canCreate={canCreate}
      canDelete={canDelete}
    />
  )
}
