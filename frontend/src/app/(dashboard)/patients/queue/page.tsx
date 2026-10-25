import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import Link from "next/link"
import { ChevronRight, HeartPulse } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import { RiskBadge } from "@/components/shared/RiskBadge"
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

function fmtDate(iso?: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

/**
 * The doctor's high-risk queue: their assigned patients (via
 * doctor_patient_assignments, RLS-scoped) ordered by their latest
 * stored risk score, highest first. Patients without an assessment
 * cannot be ranked and are counted honestly below the list instead of
 * being given an invented position.
 */
export default async function RiskQueuePage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: assignments } = user
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
    : { data: null }

  const rows: { patient: AssignedPatient; latest: PredictionRow }[] = []
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
    rows.push({ patient, latest: preds[0] })
  }

  rows.sort((a, b) => (b.latest.probability ?? 0) - (a.latest.probability ?? 0))

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <div>
        <p className="eyebrow">Doctor workspace</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">High-risk queue</h1>
        <p className="mt-1 text-muted-foreground">
          Your assigned patients, ordered by their latest risk score — highest first.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="No scored patients in your queue"
          description="Patients appear here once they are assigned to you and have at least one risk assessment. Run an assessment from a patient's record to add them to the queue."
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
                  {((latest.probability ?? 0) * 100).toFixed(0)}
                  <span className="font-sans text-xs font-semibold text-muted-foreground">%</span>
                </span>
                <RiskBadge severity={latest.severity ?? "Low"} />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
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
