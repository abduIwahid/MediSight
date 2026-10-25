import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import {
  sendAppointmentConfirmationEmail,
  sendAppointmentReminderEmail,
  type AppointmentEmailData,
} from "@/lib/email"

/**
 * Triggers an appointment email (confirmation on booking, or a reminder
 * when something calls it — no scheduler exists yet).
 *
 * The caller must be signed in and must be the appointment's patient or
 * doctor: the appointment is loaded through the caller's own Supabase
 * session, so RLS decides visibility. Email delivery problems never
 * surface as request failures for the booking flow — the response simply
 * reports { sent: false }.
 */
export async function POST(request: Request) {
  let payload: { appointmentId?: unknown; kind?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const appointmentId = typeof payload.appointmentId === "string" ? payload.appointmentId : null
  const kind = payload.kind === "reminder" ? "reminder" : "confirmation"
  if (!appointmentId) {
    return NextResponse.json({ error: "appointmentId is required." }, { status: 400 })
  }

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
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const { data: appointment } = await supabase
    .from("appointments")
    .select("id, patient_id, doctor_id, scheduled_at, status, reason")
    .eq("id", appointmentId)
    .single()

  if (!appointment) {
    return NextResponse.json({ sent: false, error: "Appointment not found." }, { status: 404 })
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", [appointment.patient_id, appointment.doctor_id])

  const patient = profiles?.find((p) => p.id === appointment.patient_id)
  const doctor = profiles?.find((p) => p.id === appointment.doctor_id)

  if (!patient?.email) {
    console.log("[api/appointments/notify] Patient has no email on record — skipping send.")
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
      : await sendAppointmentConfirmationEmail(data)

  return NextResponse.json({ sent })
}
