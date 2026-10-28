"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { CalendarPlus, CalendarX2 } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import { PulseLoader } from "@/components/shared/PulseLoader"
import { appointmentStatusClass } from "@/lib/status"
import { fmtDateTime } from "@/lib/dates"

interface Appointment {
  id: string
  doctor_id: string
  scheduled_at: string
  status: string
  reason: string | null
  doctor: { full_name: string; specialty: string | null } | null
}

export default function MyAppointmentsPage() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming")
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const supabase = createClient()

  const load = async () => {
    setLoading(true)
    setLoadError(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // Dead session: an honest error state, not an endless spinner
      // (QA Round 1, item 38).
      setSessionError(true)
      setLoading(false)
      return
    }
    setUserId(user.id)

    const now = new Date().toISOString()
    let query = supabase
      .from("appointments")
      .select("id, doctor_id, scheduled_at, status, reason, doctor:doctor_id(full_name, specialty)")
      .eq("patient_id", user.id)

    query = tab === "upcoming"
      ? query.gte("scheduled_at", now).order("scheduled_at", { ascending: true })
      : query.lt("scheduled_at", now).order("scheduled_at", { ascending: false })

    // A failed load is NOT "no appointments" (QA Round 3, states F-02):
    // a patient told they have nothing booked may simply not attend.
    const { data, error } = await query
    if (error) {
      console.error("Appointments failed to load:", error)
      setLoadError(true)
      setAppointments([])
    } else {
      setAppointments((data as unknown as Appointment[]) || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const handleCancel = async (id: string) => {
    setActionError(null)
    // The cancel write is verified AND scoped (QA Round 3, patient F5 /
    // data-integrity DI3-07): it names the patient explicitly and only
    // fires from an active status, so a stale page cannot cancel an
    // appointment that has already been completed or cancelled.
    let query = supabase
      .from("appointments")
      .update({ status: "Cancelled" })
      .eq("id", id)
      .in("status", ["Requested", "Confirmed"])
    if (userId) query = query.eq("patient_id", userId)
    const { data, error } = await query.select("id")
    if (error || !data || data.length === 0) {
      console.error("Cancel appointment failed:", error)
      setActionError("That appointment could not be cancelled. It may already have been changed — the list has been refreshed.")
      setConfirmingId(null)
      load()
      return
    }
    setConfirmingId(null)
    // Cancellation email (fire-and-forget, like booking confirmations).
    fetch("/api/appointments/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: id, kind: "cancellation" }),
    }).catch(() => {})
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Appointments</h1>
          <p className="text-muted-foreground">View and manage your bookings.</p>
        </div>
        <Link href="/patient/appointments/book">
          <Button className="gap-2">
            <CalendarPlus className="h-4 w-4" />
            Book New
          </Button>
        </Link>
      </div>

      <div className="inline-flex rounded-2xl border bg-muted/40 p-1">
        <button
          onClick={() => setTab("upcoming")}
          aria-pressed={tab === "upcoming"}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === "upcoming" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Upcoming
        </button>
        <button
          onClick={() => setTab("past")}
          aria-pressed={tab === "past"}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === "past" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Past
        </button>
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
          {actionError}
        </div>
      )}

      {loading ? (
        <PulseLoader label="Loading your appointments" />
      ) : sessionError ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive-text">
          Your session has ended. Please{" "}
          <Link href="/login" className="font-semibold underline">sign in again</Link>{" "}
          to see your appointments.
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive-text">
          Your appointments could not be loaded.{" "}
          <button type="button" onClick={() => load()} className="font-semibold underline">Try again</button>
        </div>
      ) : appointments.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title={`No ${tab} appointments`}
          description={
            tab === "upcoming"
              ? "You have nothing booked right now. Book a visit with an available doctor to get started."
              : "Appointments you have completed or missed will appear here."
          }
          actionLabel="Book an appointment"
          actionHref="/patient/appointments/book"
        />
      ) : (
        <div className="space-y-3">
          {appointments.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-card">
              <div>
                <p className="font-medium">
                  {a.doctor?.full_name ? `Dr. ${a.doctor.full_name}` : "Doctor to be assigned"}
                  {a.doctor?.specialty ? ` · ${a.doctor.specialty}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {fmtDateTime(a.scheduled_at)} {a.reason ? `· ${a.reason}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${appointmentStatusClass(a.status)}`}>
                  {a.status}
                </span>
                {a.status === "Cancelled" && (
                  <Link
                    href={`/patient/appointments/book?doctor=${a.doctor_id}${a.reason ? `&reason=${encodeURIComponent(a.reason)}` : ""}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Book again
                  </Link>
                )}
                {tab === "upcoming" && a.status !== "Cancelled" && confirmingId !== a.id && (
                  <Button variant="outline" size="sm" onClick={() => setConfirmingId(a.id)}>
                    Cancel
                  </Button>
                )}
              </div>
              {confirmingId === a.id && (
                <div role="alertdialog" aria-label="Confirm cancellation" className="mt-3 flex w-full flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
                  <span className="text-destructive">
                    Cancel your appointment with {a.doctor?.full_name ? `Dr. ${a.doctor.full_name}` : "this doctor"} on {fmtDateTime(a.scheduled_at)}? This cannot be undone.
                  </span>
                  <span className="flex gap-2">
                    <Button variant="destructive" size="sm" onClick={() => handleCancel(a.id)}>
                      Yes, cancel it
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setConfirmingId(null)}>
                      Keep appointment
                    </Button>
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
