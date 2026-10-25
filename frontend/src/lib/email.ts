/**
 * Outbound email via Resend — server-side only.
 *
 * Used for appointment emails (confirmation + reminder) and for
 * Contact-page inquiries.
 *
 * Configuration (frontend/.env.example):
 *   RESEND_API_KEY    Resend API key. When unset, sending is skipped.
 *   APP_EMAIL_FROM    The verified sender address, e.g. appointments@abdulwahid.me
 *   CONTACT_TO_EMAIL  Where contact inquiries are delivered. Optional —
 *                     defaults to the developer's public contact email.
 *
 * Rules:
 *  - If either required variable is unset, every send is skipped
 *    silently (one server-side log line) and returns false.
 *  - A failed send NEVER throws — email problems must not break a
 *    booking. Callers treat the boolean as informational only.
 *  - Copy is factual only: names, date/time and reason come from the
 *    booking itself. No marketing claims, no invented details.
 */

export interface AppointmentEmailData {
  patientName: string
  patientEmail: string
  doctorName: string
  scheduledAt: string
  status: string
  reason?: string | null
}

function emailConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.APP_EMAIL_FROM
  if (!apiKey || !from) return null
  return { apiKey, from }
}

export function isEmailConfigured(): boolean {
  return emailConfig() !== null
}

export function isAppointmentEmailConfigured(): boolean {
  return isEmailConfigured()
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" })} UTC`
}

async function sendEmail(
  to: string,
  subject: string,
  text: string,
  options?: { replyTo?: string }
): Promise<boolean> {
  const config = emailConfig()
  if (!config) {
    console.log("[email] RESEND_API_KEY / APP_EMAIL_FROM not set — skipping email send.")
    return false
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `MediSight <${config.from}>`,
        to: [to],
        ...(options?.replyTo ? { reply_to: options.replyTo } : {}),
        subject,
        text,
      }),
    })
    if (!res.ok) {
      console.error(`[email] Resend responded with ${res.status} for an email.`)
      return false
    }
    return true
  } catch (err) {
    console.error("[email] Failed to send email:", err)
    return false
  }
}

/** Sent to the patient when an appointment is booked. */
export async function sendAppointmentConfirmationEmail(data: AppointmentEmailData): Promise<boolean> {
  const lines = [
    `Hello ${data.patientName},`,
    "",
    `Your appointment with Dr. ${data.doctorName} has been booked.`,
    "",
    `When: ${formatWhen(data.scheduledAt)}`,
    `Status: ${data.status}`,
  ]
  if (data.reason) lines.push(`Reason for visit: ${data.reason}`)
  lines.push(
    "",
    "If you need to change or cancel this appointment, sign in to MediSight and open your appointments.",
    "",
    "— MediSight"
  )
  return sendEmail(data.patientEmail, "Your MediSight appointment", lines.join("\n"))
}

/**
 * Appointment reminder for the patient. Ready to be triggered by a
 * future scheduler or manually through /api/appointments/notify —
 * no scheduler exists yet.
 */
export async function sendAppointmentReminderEmail(data: AppointmentEmailData): Promise<boolean> {
  const lines = [
    `Hello ${data.patientName},`,
    "",
    `This is a reminder of your appointment with Dr. ${data.doctorName}.`,
    "",
    `When: ${formatWhen(data.scheduledAt)}`,
    `Status: ${data.status}`,
  ]
  if (data.reason) lines.push(`Reason for visit: ${data.reason}`)
  lines.push("", "— MediSight")
  return sendEmail(data.patientEmail, "Reminder: your MediSight appointment", lines.join("\n"))
}

export interface ContactInquiryEmailData {
  name: string
  email: string
  department?: string | null
  subject: string
  message: string
}

/** Default inbox for contact inquiries when CONTACT_TO_EMAIL is unset. */
const DEFAULT_CONTACT_RECIPIENT = "contact@abdulwahid.me"

/**
 * Delivers a Contact-page inquiry to the maintainer's inbox. Reply-To
 * is set to the sender's address so a reply goes straight back to
 * them. Returns false when email is unconfigured or Resend fails.
 */
export async function sendContactInquiryEmail(data: ContactInquiryEmailData): Promise<boolean> {
  const to = process.env.CONTACT_TO_EMAIL || DEFAULT_CONTACT_RECIPIENT
  const lines = [
    "New inquiry from the MediSight contact page.",
    "",
    `Name: ${data.name}`,
    `Email: ${data.email}`,
  ]
  if (data.department) lines.push(`Department / facility: ${data.department}`)
  lines.push(`Subject: ${data.subject}`, "", "Message:", data.message)
  return sendEmail(to, `[MediSight Contact] ${data.subject}`, lines.join("\n"), {
    replyTo: data.email,
  })
}
