import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import {
  sendAppointmentConfirmationEmail,
  sendAppointmentReminderEmail,
  sendAppointmentCancellationEmail,
  type AppointmentEmailData,
} from "@/lib/email"

/**
 * Triggers an appointment email (confirmation on booking, a reminder,
 * or a cancellation notice).
 *
 * Safety contract (QA Round 3, adversarial F6 / api-security M3):
 * - The caller is authenticated BEFORE the body is read, and must be
 *   the appointment's patient, its doctor, or an admin — checked
 *   explicitly here, not left to whatever RLS happens to expose.
 * - The kind must match the appointment's CURRENT status: a
 *   confirmation can only be sent for a live booking, a cancellation
 *   notice only for a cancelled one. Previously either participant
 *   could re-send a "has been booked" email for a cancelled visit,
 *   forever.
 * - The patient's email notification preference is honoured.
 * Email delivery problems never surface as request failures for the
 * booking flow — the response simply reports { sent: false }.
 */
export async function POST(request: Request) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Please sign in and try again." }, { status: 401 })
  }

  let payload: { appointmentId?: unknown; kind?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "We couldn't read that request. Please try again." }, { status: 400 })
  }

  const appointmentId = typeof payload.appointmentId === "string" ? payload.appointmentId : null
  const kind = payload.kind
  if (!appointmentId) {
    return NextResponse.json({ error: "That appointment link is incomplete. Please try again." }, { status: 400 })
  }
  if (kind !== "confirmation" && kind !== "reminder" && kind !== "cancellation") {
    return NextResponse.json({ error: "That kind of notification isn't supported." }, { status: 400 })
  }

  const { data: appointment } = await supabase
    .from("appointments")
    .select("id, patient_id, doctor_id, scheduled_at, status, reason")
    .eq("id", appointmentId)
    .single()

  if (!appointment) {
    return NextResponse.json({ sent: false, error: "Appointment not found." }, { status: 404 })
  }

  // Explicit participation check: the appointment must belong to the
  // caller (or the caller must be an admin acting on its behalf).
  const isParticipant = appointment.patient_id === user.id || appointment.doctor_id === user.id
  if (!isParticipant) {
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    if (callerProfile?.role !== "admin" && callerProfile?.role !== "super_admin") {
      return NextResponse.json({ sent: false, error: "This appointment isn't yours to notify about." }, { status: 403 })
    }
  }

  // Status gates: the email has to tell the truth about the booking.
  const status = appointment.status
  const allowed =
    (kind === "confirmation" && (status === "Requested" || status === "Confirmed")) ||
    (kind === "reminder" && status === "Confirmed") ||
    (kind === "cancellation" && status === "Cancelled")
  if (!allowed) {
    return NextResponse.json({ sent: false, error: "That notification doesn't match the appointment's current status." }, { status: 409 })
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, notification_prefs")
    .in("id", [appointment.patient_id, appointment.doctor_id])

  const patient = profiles?.find((p) => p.id === appointment.patient_id)
  const doctor = profiles?.find((p) => p.id === appointment.doctor_id)

  if (!patient?.email) {
    console.log("[api/appointments/notify] Patient has no email on record — skipping send.")
    return NextResponse.json({ sent: false })
  }

  // Honour the patient's email preference (QA Round 3, profile M5).
  const prefs = patient.notification_prefs as { email?: boolean } | null
  if (prefs && prefs.email === false) {
    return NextResponse.json({ sent: false })
  }

  const data: AppointmentEmailData = {
    patientName: patient.full_name || "Patient",
    patientEmail: patient.email,
    doctorName: doctor?.full_name || "your doctor",
    scheduledAt: appointment.scheduled_at,
    status: appointment.status,
    reason: appointment.reason,
  }

  const sent =
    kind === "reminder"
      ? await sendAppointmentReminderEmail(data)
      : kind === "cancellation"
        ? await sendAppointmentCancellationEmail(data)
        : await sendAppointmentConfirmationEmail(data)

  return NextResponse.json({ sent })
}
