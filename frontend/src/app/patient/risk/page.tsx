"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Activity, CalendarPlus, Info } from "lucide-react"
import { PulseLoader } from "@/components/shared/PulseLoader"
import { EmptyState } from "@/components/shared/EmptyState"
import { ShapFactorList, type ShapFeature } from "@/components/shared/ShapFactorList"
import { severityPillClass } from "@/lib/status"
import { fmtDate } from "@/lib/dates"

interface OwnPrediction {
  id: string
  disease: string | null
  probability: number | null
  severity: string | null
  created_at: string
}

/**
 * "My Risk" — the patient's view of their own latest assessment.
 *
 * Reads only what the own-record RLS policies (migration 22) allow:
 * the one clinical record linked to this account, its predictions and
 * the SHAP explanation for the latest one. An account with no linked
 * record (or a record with no assessment yet) gets an honest empty
 * state — never another patient's data, never a fabricated score.
 */
export default function PatientRiskPage() {
  const [latest, setLatest] = useState<OwnPrediction | null>(null)
  const [history, setHistory] = useState<OwnPrediction[]>([])
  const [factors, setFactors] = useState<ShapFeature[]>([])
  const [hasRecord, setHasRecord] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setSessionError(true)
        setLoading(false)
        return
      }

      const { data: record, error: recordError } = await supabase
        .from("patients")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()

      if (recordError) {
        console.error("Own patient record failed to load:", recordError)
        setLoadError(true)
        setLoading(false)
        return
      }
      if (!record) {
        // No linked clinical record yet — the empty state below.
        setLoading(false)
        return
      }
      setHasRecord(true)

      const { data: predictions, error: predError } = await supabase
        .from("predictions")
        .select("id, disease, probability, severity, created_at")
        .eq("patient_id", record.id)
        .order("created_at", { ascending: false })
        .limit(5)

      if (predError) {
        console.error("Own predictions failed to load:", predError)
        setLoadError(true)
        setLoading(false)
        return
      }

      const rows = (predictions as OwnPrediction[]) || []
      setHistory(rows)
      const first = rows[0] ?? null
      setLatest(first)

      if (first) {
        const { data: explanation } = await supabase
          .from("explanations")
          .select("shap_values")
          .eq("prediction_id", first.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (explanation && Array.isArray(explanation.shap_values)) {
          setFactors(explanation.shap_values as ShapFeature[])
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Risk</h1>
          <p className="text-muted-foreground">Your latest risk assessment from your care team.</p>
        </div>
        <PulseLoader label="Loading your risk assessment" />
      </div>
    )
  }

  if (sessionError) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive-text">
        Your session has ended. Please{" "}
        <Link href="/login" className="font-semibold underline">sign in again</Link>{" "}
        to see your risk assessment.
      </div>
    )
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive-text">
        Your risk assessment could not be loaded. Please reload the page to try again.
      </div>
    )
  }

  if (!hasRecord || !latest) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Risk</h1>
          <p className="text-muted-foreground">Your latest risk assessment from your care team.</p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-card">
          <EmptyState
            icon={Activity}
            title="No risk assessment yet"
            description={
              hasRecord
                ? "Your care team has not run a risk assessment on your record yet. Assessments are done during your care, and your latest result will appear here."
                : "Your portal account is not linked to a clinical record yet, so there is no assessment to show. Once your care team links your record, your latest result will appear here."
            }
            actionLabel="Book an Appointment"
            actionHref="/patient/appointments/book"
          />
        </div>
      </div>
    )
  }

  const pct = latest.probability != null ? Math.round(latest.probability * 100) : null
  const severity = latest.severity || "Unknown"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Risk</h1>
        <p className="text-muted-foreground">Your latest risk assessment from your care team.</p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {latest.disease ? `${latest.disease} risk` : "Risk assessment"} · {fmtDate(latest.created_at)}
            </p>
            <div className="mt-1 flex items-end gap-3">
              <span className="font-display text-5xl leading-none">{pct != null ? `${pct}%` : "—"}</span>
              <span className={`mb-1 rounded-full border px-3 py-1 text-xs font-medium ${severityPillClass[severity] ?? ""}`}>
                {severity}
              </span>
            </div>
          </div>
          <Link
            href="/patient/appointments/book"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            <CalendarPlus className="h-4 w-4" />
            Book a follow-up
          </Link>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This score is an estimate from a statistical model, based on the health information in your
            record. It is not a diagnosis. Please discuss what it means with your doctor.
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-card">
        <h2 className="font-semibold">What influenced this score</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          The factors below pushed the estimate up (amber) or pulled it down (green), largest first.
        </p>
        <ShapFactorList data={factors} />
      </div>

      {history.length > 1 && (
        <div className="rounded-xl border bg-card p-6 shadow-card">
          <h2 className="mb-4 font-semibold">Previous assessments</h2>
          <div className="space-y-3">
            {history.slice(1).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/10 px-4 py-3">
                <p className="text-sm font-medium">
                  {p.disease ? `${p.disease} risk` : "Risk assessment"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{fmtDate(p.created_at)}</span>
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">{p.probability != null ? `${Math.round(p.probability * 100)}%` : "—"}</span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium ${severityPillClass[p.severity || "Unknown"] ?? ""}`}>
                    {p.severity || "Unknown"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
