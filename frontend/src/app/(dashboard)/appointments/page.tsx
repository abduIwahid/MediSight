"use client"

import { useEffect, useState } from "react"
import { Calendar, Clock, CheckCircle2, XCircle, CheckCheck, Loader2, CalendarX2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { EmptyState } from "@/components/shared/EmptyState"
import { PulseLoader } from "@/components/shared/PulseLoader"
import { appointmentStatusClass } from "@/lib/status"

type Appointment = {
  id: string
  scheduled_at: string
  status: "Requested" | "Confirmed" | "Completed" | "Cancelled"
  reason: string | null
  notes: string | null
  patient: { full_name: string; email: string; phone: string | null } | null
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>("All")
  const supabase = createClient()

  const load = async () => {
    setLoading(true)
    setLoadError(false)
    const { data, error } = await supabase
      .from("appointments")
      .select("id, scheduled_at, status, reason, notes, patient:patient_id(full_name, email, phone)")
      .order("scheduled_at", { ascending: true })
    if (error) {
      setLoadError(true)
    } else {
      setAppointments((data as unknown as Appointment[]) || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateStatus = async (id: string, status: Appointment["status"]) => {
    setUpdatingId(id)
    setActionError(null)
    // .select() verification: an RLS-refused update returns no error and
    // zero rows — without the row check the UI would show a status the
    // database never stored (QA Round 2, cluster 7).
    const { data: updated, error } = await supabase.from("appointments").update({ status }).eq("id", id).select("id")
    if (error || !updated || updated.length === 0) {
      // A failed write is said out loud — the row keeps its real status.
      setActionError("That appointment could not be updated. Please try again.")
    } else {
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
    }
    setUpdatingId(null)
  }

  const filtered = filter === "All" ? appointments : appointments.filter((a) => a.status === filter)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Appointments</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review requests and manage your patient schedule.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {["All", "Requested", "Confirmed", "Completed", "Cancelled"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              filter === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <PulseLoader showWordmark={false} />
        </div>
      ) : loadError ? (
        <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-12 text-center">
          <p className="text-sm text-destructive">Appointments could not be loaded. Check your connection and try again.</p>
          <Button variant="outline" size="sm" onClick={load}>Try again</Button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title={filter === "All" ? "No appointments yet" : `No ${filter.toLowerCase()} appointments`}
          description="Appointments booked by patients will appear here. Open the patient registry to review records in the meantime."
          actionLabel="Open patient registry"
          actionHref="/patients"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{a.patient?.full_name || "Unknown patient"}</p>
                    <Badge className={appointmentStatusClass(a.status)} variant="outline">{a.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.patient?.email}{a.patient?.phone ? ` · ${a.patient.phone}` : ""}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {new Date(a.scheduled_at).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {new Date(a.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {a.reason && <p className="text-sm text-muted-foreground">&quot;{a.reason}&quot;</p>}
                </div>

                <div className="flex items-center gap-2">
                  {updatingId === a.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      {a.status === "Requested" && (
                        <>
                          <button onClick={() => updateStatus(a.id, "Confirmed")} title="Confirm" aria-label="Confirm appointment" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#1E7A46] hover:bg-[#E2F0E6]">
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => updateStatus(a.id, "Cancelled")} title="Reject" aria-label="Reject appointment" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#C0392B] hover:bg-[#FAE9E7]">
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {a.status === "Confirmed" && (
                        <button onClick={() => updateStatus(a.id, "Completed")} title="Mark Completed" aria-label="Mark appointment completed" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#1F6E96] hover:bg-[#2E7FA8]/10">
                          <CheckCheck className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
