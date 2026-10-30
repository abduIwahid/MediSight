"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { CalendarPlus, CalendarClock, Bot, ArrowRight, Gauge } from "lucide-react"
import { PulseLoader } from "@/components/shared/PulseLoader"
import { EmptyState } from "@/components/shared/EmptyState"
import { appointmentStatusClass } from "@/lib/status"
import { fmtDateTime } from "@/lib/dates"

interface Appointment {
  id: string
  scheduled_at: string
  status: string
  reason: string | null
  doctor: { full_name: string; specialty: string | null } | null
}

export default function PatientDashboardPage() {
  const [fullName, setFullName] = useState("")
  const [upcoming, setUpcoming] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // A dead session used to leave this page on "Loading..." forever
        // (QA Round 1, item 38). Show an honest error with a way back in.
        setSessionError(true)
        setLoading(false)
        return
      }

      // The profile and appointments reads are independent — run them
      // together instead of as a serial chain (QA Round 3, perf P-8).
      // A failed appointments read is NOT "no upcoming appointments"
      // (QA Round 3, states F-02).
      const [profileRes, apptsRes] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).single(),
        supabase
          .from("appointments")
          .select("id, scheduled_at, status, reason, doctor:doctor_id(full_name, specialty)")
          .eq("patient_id", user.id)
          // "Upcoming" excludes cancelled bookings (QA Round 1, item 66).
          .neq("status", "Cancelled")
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(3),
      ])
      if (profileRes.data) setFullName(profileRes.data.full_name)
      if (apptsRes.error) {
        console.error("Upcoming appointments failed to load:", apptsRes.error)
        setLoadError(true)
      } else {
        setUpcoming((apptsRes.data as unknown as Appointment[]) || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {fullName ? `Welcome back, ${fullName.split(" ")[0]}` : "Welcome back"}
        </h1>
        <p className="text-muted-foreground">Manage your appointments and get quick health guidance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/patient/risk"
          className="group flex items-center justify-between rounded-xl border bg-card p-6 shadow-card transition hover:shadow-md hover:border-primary/40"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">My Risk</p>
              <p className="text-sm text-muted-foreground">Your latest assessment and what drives it</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
        </Link>

        <Link
          href="/patient/appointments/book"
          className="group flex items-center justify-between rounded-xl border bg-card p-6 shadow-card transition hover:shadow-md hover:border-primary/40"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarPlus className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Book an Appointment</p>
              <p className="text-sm text-muted-foreground">Find a doctor and schedule a visit</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
        </Link>

        <Link
          href="/patient/assistant"
          className="group flex items-center justify-between rounded-xl border bg-card p-6 shadow-card transition hover:shadow-md hover:border-primary/40"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Ask the AI Assistant</p>
              <p className="text-sm text-muted-foreground">Describe symptoms, get pointed to the right specialist</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Upcoming Appointments</h2>
          </div>
          <Link href="/patient/appointments" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </div>

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
            Your appointments could not be loaded. Please reload the page to try again.
          </div>
        ) : upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No upcoming appointments"
            description="When you book a visit, it will appear here."
            actionLabel="Book an Appointment"
            actionHref="/patient/appointments/book"
          />
        ) : (
          <div className="space-y-3">
            {upcoming.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/10 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {a.doctor?.full_name ? `Dr. ${a.doctor.full_name}` : "Doctor to be assigned"}
                    {a.doctor?.specialty ? ` · ${a.doctor.specialty}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDateTime(a.scheduled_at)} {a.reason ? `· ${a.reason}` : ""}
                  </p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${appointmentStatusClass(a.status)}`}>{a.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
