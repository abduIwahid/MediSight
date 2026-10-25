import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
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
 * Accepts a Contact-page inquiry, emails it to the maintainer via
 * Resend, and stores a copy in contact_inquiries.
 *
 * Like every dashboard API route, this sits behind the app's
 * middleware, so callers are signed in. The archive insert goes
 * through the caller's session client; the table's RLS policy
 * ("ContactInquiries: allow anonymous insert") accepts the insert
 * while reads stay admin-only.
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
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const name = cleanField(payload.name, LIMITS.name)
  if (!name) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 })
  }

  const email = cleanField(payload.email, LIMITS.email)
  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 })
  }

  // Department is optional; an over-long one is rejected, an empty or
  // missing one is stored as null.
  let department: string | null = null
  if (payload.department !== undefined && payload.department !== null && payload.department !== "") {
    department = cleanField(payload.department, LIMITS.department)
    if (!department) {
      return NextResponse.json({ error: "Please shorten the department field." }, { status: 400 })
    }
  }

  const subject = cleanField(payload.subject, LIMITS.subject)
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
  // record, so a failed insert is logged, never surfaced.
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
    )
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
