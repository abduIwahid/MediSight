import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isEmailConfigured, sendContactInquiryEmail } from "@/lib/email"

const LIMITS = {
  name: 100,
  email: 254,
  department: 120,
  subject: 120,
  message: 5000,
} as const

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cleanField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

/**
 * Single-line fields additionally lose CR/LF (QA Round 3, adversarial
 * F11): a newline in name or subject reaches the maintainer's mail
 * client inside email headers — a smuggled "Bcc:" line must come out
 * before the value is stored or mailed. The free-text message keeps
 * its line breaks.
 */
function cleanSingleLine(value: unknown, max: number): string | null {
  const cleaned = cleanField(value, max)
  if (cleaned === null) return null
  return cleaned.replace(/[\r\n]+/g, " ")
}

/**
 * Accepts a Contact-page inquiry, emails it to the maintainer via
 * Resend, and stores a copy in contact_inquiries.
 *
 * The handler checks the caller's session itself (below) — middleware
 * deliberately lets API requests reach their own handlers, so "the
 * page is gated" does NOT make this route authenticated. Without the
 * check, anyone on the internet could submit inquiries through the
 * project's Resend account and write rows into contact_inquiries
 * (QA Round 2, security M1). The archive insert goes through the
 * caller's session client; reads on the table stay admin-only.
 *
 * The email is the delivery of record — if it cannot be sent, the
 * request fails honestly. The database copy is best-effort: if the
 * insert fails after a successful send, the request still reports
 * success and the failure is logged server-side.
 *
 * When RESEND_API_KEY / APP_EMAIL_FROM are unset (email activates at
 * deployment), the route answers 503 and nothing is stored.
 */
export async function POST(request: Request) {
  // Signed-in users only — the contact page lives inside the staff
  // dashboard, so there is no anonymous use case for this endpoint.
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  let payload: {
    name?: unknown
    email?: unknown
    department?: unknown
    subject?: unknown
    message?: unknown
  }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "We couldn't read that message. Please try again." }, { status: 400 })
  }

  const name = cleanSingleLine(payload.name, LIMITS.name)
  if (!name) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 })
  }

  // The reply-to address is the SESSION's email, never the body's
  // (QA Round 3, api-security L6): the route is signed-in-only, so a
  // body-supplied address could only make maintainer replies land in
  // someone else's inbox. The body value is still validated for the
  // archive row's shape, but the mailed reply-to uses the account.
  const email = user.email ?? cleanField(payload.email, LIMITS.email)
  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Your account has no valid email address on record." }, { status: 400 })
  }

  // Department is optional; an over-long one is rejected, an empty or
  // missing one is stored as null.
  let department: string | null = null
  if (payload.department !== undefined && payload.department !== null && payload.department !== "") {
    department = cleanSingleLine(payload.department, LIMITS.department)
    if (!department) {
      return NextResponse.json({ error: "Please shorten the department field." }, { status: 400 })
    }
  }

  const subject = cleanSingleLine(payload.subject, LIMITS.subject)
  if (!subject) {
    return NextResponse.json({ error: "Please enter a subject." }, { status: 400 })
  }

  const message = cleanField(payload.message, LIMITS.message)
  if (!message) {
    return NextResponse.json({ error: "Please enter your message." }, { status: 400 })
  }

  if (!isEmailConfigured()) {
    console.log("[api/contact] Email is not configured — inquiry not sent.")
    return NextResponse.json(
      {
        error:
          "Email delivery is not configured on this server yet, so your message was not sent. Please use the email address listed on this page instead.",
      },
      { status: 503 }
    )
  }

  const sent = await sendContactInquiryEmail({ name, email, department, subject, message })
  if (!sent) {
    return NextResponse.json(
      {
        error:
          "Your message could not be sent. Please try again later, or use the email address listed on this page.",
      },
      { status: 503 }
    )
  }

  // Best-effort archive copy — the email above is the delivery of
  // record, so a failed insert is logged, never surfaced. (Same session
  // client as the auth check above.)
  try {
    const { error: insertError } = await supabase.from("contact_inquiries").insert({
      full_name: name,
      email,
      department,
      subject,
      message,
    })
    if (insertError) {
      console.error(
        "[api/contact] Inquiry email was sent, but storing the inquiry failed:",
        insertError
      )
    }
  } catch (err) {
    console.error("[api/contact] Inquiry email was sent, but storing the inquiry failed:", err)
  }

  return NextResponse.json({ sent: true })
}
