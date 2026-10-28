import { createServerClient, type CookieOptions } from "@supabase/ssr"
import type { EmailOtpType } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const token_hash = requestUrl.searchParams.get("token_hash")
  const type = requestUrl.searchParams.get("type")
  const explicitNext = requestUrl.searchParams.get("next")

  // `next` is an exact-match allowlist, not a prefix test: only the two
  // destinations the product itself produces are honoured. Anything else
  // is dropped and the role-based destination below is used instead.
  // (QA Round 3, adversarial F4 / auth M5: the old prefix filter let
  // "/<TAB>/evil.example" through — WHATWG URL parsing strips tabs and
  // newlines AFTER the filter ran, collapsing it to "//evil.example",
  // an off-site redirect right after a successful sign-in. An exact
  // allowlist plus a post-parse origin check closes that class.)
  const ALLOWED_NEXT = new Set(["/onboarding/doctor", "/patient/dashboard"])
  let safeNext: string | null = null
  if (
    explicitNext &&
    ALLOWED_NEXT.has(explicitNext) &&
    !/[\u0000-\u0020\\]/.test(explicitNext)
  ) {
    const parsed = new URL(explicitNext, requestUrl.origin)
    if (parsed.origin === requestUrl.origin && parsed.pathname === explicitNext) {
      safeNext = explicitNext
    }
  }

  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: "", ...options })
        },
      },
    }
  )

  // Once a session exists, work out where this user actually belongs —
  // an explicit `next` (e.g. the doctor-registration completion page for a
  // new OAuth signup) wins; otherwise route by role/status so a patient
  // never briefly lands on the doctor dashboard shell or vice versa.
  const resolveDestination = async () => {
    // Recovery intent outranks an explicit `next` (QA Round 3, auth M5):
    // a recovery link carrying &next=/dashboard used to land the user on
    // their dashboard having never set a new password.
    if (type === "recovery") return "/update-password"

    if (safeNext) return safeNext

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return "/login"

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile) return "/onboarding"
    if (profile.role === "patient") return "/patient/dashboard"

    const doctorRoles = ["doctor", "super_admin", "hospital_admin", "nurse", "data_scientist"]
    if (doctorRoles.includes(profile.role)) {
      if (profile.role === "doctor") {
        const { data: doctor } = await supabase.from("doctors").select("status").eq("user_id", user.id).single()
        if (doctor?.status !== "approved") return "/pending-approval"
      }
      return "/dashboard"
    }
    return "/dashboard"
  }

  // A genuine recovery exchange marks the session as a recovery session
  // (short-lived cookie) so /update-password can tell "arrived via a
  // one-time email link" apart from "typed the URL into a signed-in
  // browser" — the latter must re-prove the current password
  // (QA Round 3, auth H2).
  const redirectToDest = async () => {
    const dest = await resolveDestination()
    const res = NextResponse.redirect(new URL(dest, requestUrl.origin))
    if (dest === "/update-password") {
      res.cookies.set("whyrisk_recovery", "1", {
        path: "/update-password",
        maxAge: 900,
        sameSite: "lax",
      })
    }
    return res
  }

  // Handle PKCE code exchange (signup confirmation, magic link)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return redirectToDest()
    }
  }

  // Handle token_hash (email confirmation OTP flow)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as EmailOtpType })
    if (!error) {
      return redirectToDest()
    }
  }

  // Auth failed — redirect to login with error message
  return NextResponse.redirect(
    new URL("/login?error=Could+not+confirm+your+account.+Please+try+again.", requestUrl.origin)
  )
}
