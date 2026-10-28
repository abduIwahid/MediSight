"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PulseLoader } from "@/components/shared/PulseLoader"

interface Doctor {
  id: string
  full_name: string
  specialty: string | null
  department: string | null
}

export default function BookAppointmentPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [doctorId, setDoctorId] = useState("")
  const [date, setDate] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const loadDoctors = async () => {
      // Booking lists APPROVED doctors only (QA Round 1, item 31), and
      // availability comes from the one source, availability_status —
      // not the legacy `available` bool.
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, specialty, department, doctors!inner(status)")
        .eq("role", "doctor")
        .eq("doctors.status", "approved")
        .eq("availability_status", "available")
        .order("full_name")

      if (error) {
        // A failed load is NOT "no doctors available" — say so, with a
        // retry, instead of an empty list that looks final.
        console.error("Doctor list failed to load:", error)
        setLoadError(true)
      } else if (data) {
        setDoctors(data)
      }
      setLoading(false)
    }
    loadDoctors()
    // "Book again" from a cancelled appointment pre-fills the doctor and
    // reason (QA Round 3, patient-portal F4).
    const params = new URLSearchParams(window.location.search)
    const prefillDoctor = params.get("doctor")
    const prefillReason = params.get("reason")
    if (prefillDoctor) setDoctorId(prefillDoctor)
    if (prefillReason) setReason(prefillReason)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    // try/finally (QA Round 3, patient-portal F3): an exception anywhere
    // below used to leave the form wedged on "Booking…" forever.
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError("You must be signed in to book an appointment.")
        return
      }

      if (!doctorId || !date) {
        setError("Please choose a doctor and a date/time.")
        return
      }

      // Validate the date in code, not only via the input's min
      // attribute (F3): past dates, absurd dates and unparseable values
      // previously reached the insert unchecked — and an invalid Date
      // threw inside toISOString() with no recovery.
      const when = new Date(date)
      if (Number.isNaN(when.getTime())) {
        setError("Please choose a valid date and time.")
        return
      }
      const nowMs = Date.now()
      if (when.getTime() < nowMs + 60 * 60 * 1000) {
        setError("Please choose a time at least an hour from now.")
        return
      }
      if (when.getTime() > nowMs + 90 * 24 * 60 * 60 * 1000) {
        setError("Appointments can be booked up to 90 days ahead. Please choose an earlier date.")
        return
      }

      // Availability is re-checked at submit, not only when the dropdown
      // was built (F2): a doctor who became unavailable — or whose
      // approval was revoked — after the page loaded must not take the
      // booking.
      const { data: doctor, error: doctorError } = await supabase
        .from("profiles")
        .select("id, availability_status, doctors!inner(status)")
        .eq("id", doctorId)
        .eq("role", "doctor")
        .single()
      const doctorRow = doctor as unknown as { availability_status?: string; doctors?: { status?: string } } | null
      if (doctorError || !doctorRow || doctorRow.availability_status !== "available" || doctorRow.doctors?.status !== "approved") {
        setError("That doctor is no longer available for booking. Please choose another doctor.")
        return
      }

      // Double-booking check (F1): no active appointment for this doctor
      // within 30 minutes of the chosen time. Appointments carry no
      // duration, so 30 minutes either side is the clash window. Note:
      // RLS limits which rows the caller can see, so this fully covers
      // the patient's own clashes and any visible ones — the hard
      // guarantee is the database constraint on the owner-ask list.
      const clashStart = new Date(when.getTime() - 30 * 60 * 1000).toISOString()
      const clashEnd = new Date(when.getTime() + 30 * 60 * 1000).toISOString()
      const { data: clashes, error: clashError } = await supabase
        .from("appointments")
        .select("id")
        .eq("doctor_id", doctorId)
        .neq("status", "Cancelled")
        .gte("scheduled_at", clashStart)
        .lte("scheduled_at", clashEnd)
        .limit(1)
      if (clashError) {
        console.error("Availability check failed:", clashError)
        setError("Your appointment could not be checked just now. Please try again.")
        return
      }
      if (clashes && clashes.length > 0) {
        setError("That time is no longer available with this doctor — another appointment is booked then. Please choose a different time.")
        return
      }

      const { data: inserted, error: insertError } = await supabase.from("appointments").insert({
        patient_id: user.id,
        doctor_id: doctorId,
        scheduled_at: when.toISOString(),
        reason: reason || null,
        status: "Requested",
      }).select("id").single()

      if (insertError) {
        console.error("Booking failed:", insertError)
        setError("Your appointment could not be booked. Please check the details and try again — if it keeps failing, the doctor may no longer be available.")
        return
      }
      // Fire-and-forget confirmation email. The notify route skips
      // sending when email is not configured, and an email failure never
      // affects the booking — so this is never awaited.
      if (inserted?.id) {
        fetch("/api/appointments/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appointmentId: inserted.id, kind: "confirmation" }),
        }).catch(() => {})
      }
      setSuccess(true)
      setTimeout(() => router.push("/patient/appointments"), 1200)
    } finally {
      setSubmitting(false)
    }
  }

  // The datetime-local minimum must be in LOCAL time — slicing a UTC ISO
  // string shifted the earliest bookable slot by the UTC offset (QA
  // Round 1, item 67).
  const minDateLocal = new Date(Date.now() + 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, "0")
  const minDateTime = `${minDateLocal.getFullYear()}-${pad(minDateLocal.getMonth() + 1)}-${pad(minDateLocal.getDate())}T${pad(minDateLocal.getHours())}:${pad(minDateLocal.getMinutes())}`

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Book an Appointment</h1>
        <p className="text-muted-foreground">Choose a doctor and a time that works for you.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border bg-card p-6 shadow-card">
        <div className="space-y-2">
          <Label htmlFor="doctor-select">Doctor</Label>
          {loading ? (
            <PulseLoader label="Loading doctors" />
          ) : loadError ? (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
              The doctor list could not be loaded.{" "}
              <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">Try again</button>
            </div>
          ) : doctors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No doctors are currently available for booking. Please check back later.</p>
          ) : (
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger id="doctor-select">
                <SelectValue placeholder="Select a doctor" />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    Dr. {d.full_name}{d.specialty ? ` — ${d.specialty}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">Date &amp; time</Label>
          <input
            id="date"
            type="datetime-local"
            value={date}
            min={minDateTime}
            onChange={(e) => setDate(e.target.value)}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reason">Reason for visit (optional)</Label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Briefly describe why you'd like to see the doctor"
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        {error && <div role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive-text">{error}</div>}
        {success && <div role="status" className="rounded-xl border border-[#1E7A46]/30 bg-[#E2F0E6] px-4 py-3 text-sm text-[#1E7A46]">Appointment requested! Redirecting…</div>}

        <Button type="submit" className="w-full" disabled={submitting || doctors.length === 0}>
          {submitting ? "Booking…" : "Request Appointment"}
        </Button>
      </form>
    </div>
  )
}
