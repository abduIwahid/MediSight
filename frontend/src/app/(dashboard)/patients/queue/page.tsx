import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import Link from "next/link"
import { ChevronRight, HeartPulse } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { fmtDate } from "@/lib/dates"
import type { PatientDemographics, PredictionRow } from "@/lib/types"

export const dynamic = "force-dynamic"

interface AssignedPatient {
  id: string
  mrn?: string | null
  demographics?: PatientDemographics | null
  predictions?: PredictionRow[] | null
}

function patientName(d?: PatientDemographics | null): string {
  if (!d) return "Unknown Patient"
  if (d.full_name) return d.full_name
  if (d.name) return d.name
  const first = d.first_name || d.firstName || ""
  const last = d.last_name || d.lastName || ""
  return `${first} ${last}`.trim() || "Unknown Patient"
}

/**
 * The doctor's high-risk queue: their assigned patients (via
 * doctor_patient_assignments, RLS-scoped) ordered by their latest
 * stored risk score, highest first. The default view is the High and
 * Critical patients — the ones who need action; "Show all" lists every
 * scored patient. Patients without an assessment cannot be ranked and
 * are counted honestly below the list instead of being given an
 * invented position.
 */
export default async function RiskQueuePage({
  searchParams,
}: {
  searchParams?: { severity?: string }
}) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const showAll = searchParams?.severity === "all"

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: assignments, error: assignmentsError } = user
    ? await supabase
        .from("doctor_patient_assignments")
        .select(`
          patient_id,
          patients (
            id,
            mrn,
            demographics,
            predictions (id, disease, probability, severity, created_at)
          )
        `)
        .eq("doctor_id", user.id)
    : { data: null, error: null }

  const allRows: { patient: AssignedPatient; latest: PredictionRow }[] = []
  let unscored = 0

  for (const assignment of assignments || []) {
    const patient = assignment.patients as unknown as AssignedPatient | null
    if (!patient) continue
    const preds = [...(patient.predictions || [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    if (preds.length === 0) {
      unscored += 1
      continue
    }
    allRows.push({ patient, latest: preds[0] })
  }

  allRows.sort((a, b) => (b.latest.probability ?? 0) - (a.latest.probability ?? 0))

  const rows = showAll
    ? allRows
    : allRows.filter((r) => r.latest.severity === "High" || r.latest.severity === "Critical")
  const hiddenByFilter = allRows.length - rows.length

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <div>
        <p className="eyebrow">Doctor workspace</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">High-risk queue</h1>
        <p className="mt-1 text-muted-foreground">
          Your assigned patients, ordered by their latest risk score — highest first.
        </p>
      </div>

      <div className="inline-flex rounded-xl border bg-muted/40 p-1" role="group" aria-label="Severity filter">
        <Link
          href="/patients/queue"
          aria-current={!showAll ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!showAll ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          High &amp; Critical
        </Link>
        <Link
          href="/patients/queue?severity=all"
          aria-current={showAll ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${showAll ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Show all
        </Link>
      </div>

      {assignmentsError ? (
        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-destructive">
          <h2 className="font-bold">Your queue could not be loaded</h2>
          <p className="text-sm">Please reload the page to try again.</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title={showAll ? "No scored patients in your queue" : "No High or Critical patients right now"}
          description={showAll
            ? "Patients appear here once they are assigned to you and have at least one risk assessment. Run an assessment from a patient's record to add them to the queue."
            : "None of your assigned patients currently has a High or Critical latest score. Switch to Show all to see every scored patient."}
          actionLabel="View patients"
          actionHref="/patients"
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            {rows.map(({ patient, latest }, i) => (
              <Link
                key={patient.id}
                href={`/patients/${patient.id}/predictions/${latest.id}`}
                className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/60 ${
                  i > 0 ? "border-t border-border" : ""
               }`}
              >
                <span className="w-8 shrink-0 text-center font-display text-lg text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{patientName(patient.demographics)}</span>
                  <span className="block text-xs text-muted-foreground">
                    <span className="font-mono">{patient.mrn || "—"}</span> · {latest.disease || "Diabetes"} ·
                    assessed {fmtDate(latest.created_at)}
                  </span>
                </span>
                <span className="shrink-0 font-display text-2xl">
                  {latest.probability != null ? (
                    <>
                      {(latest.probability * 100).toFixed(0)}
                      <span className="font-sans text-xs font-semibold text-muted-foreground">%</span>
                    </>
                  ) : (
                    <span className="font-sans text-sm font-medium text-muted-foreground">Not recorded</span>
                  )}
                </span>
                <RiskBadge severity={latest.severity ?? "Unknown"} />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
          {hiddenByFilter > 0 && (
            <p className="text-xs text-muted-foreground">
              {hiddenByFilter} scored patient{hiddenByFilter === 1 ? " is" : "s are"} below High severity and hidden by the filter.
            </p>
          )}
          {unscored > 0 && (
            <p className="text-xs text-muted-foreground">
              {unscored} assigned patient{unscored === 1 ? " has" : "s have"} no risk assessment yet and{" "}
              {unscored === 1 ? "is" : "are"} not ranked above.
            </p>
          )}
        </>
      )}
    </div>
  )
}
