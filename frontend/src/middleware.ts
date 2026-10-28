import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        // Mutate the ONE response object instead of rebuilding it per
        // cookie (QA Round 3, auth M1): rebuilding discarded cookies set
        // by earlier calls in the same request, which could truncate
        // chunked session cookies and corrupt the refreshed session.
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          supabaseResponse.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          supabaseResponse.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // No Supabase auth cookie on the request means there is provably no
  // session — skip the network validation entirely (QA Round 3, perf
  // P-6). Signed-in requests still validate (and refresh) as before.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  const {
    data: { user },
  } = hasAuthCookie ? await supabase.auth.getUser() : { data: { user: null } }

  // Redirects must carry the refreshed session cookies with them
  // (QA Round 3, auth M1): returning a bare NextResponse.redirect after
  // getUser() rotated the token threw the new cookies away and could
  // sign the user out on the next request.
  const redirectWithCookies = (url: URL) => {
    const res = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }

  // Check if route is related to auth
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
                      request.nextUrl.pathname.startsWith('/signup') ||
                      request.nextUrl.pathname.startsWith('/forgot-password')

  // Session-flow routes must run their handler even when a session
  // already exists: an email confirmation or password-recovery link
  // opened in a browser that is still signed in has to reach the
  // callback / the set-new-password form. Bouncing those to the role
  // home (the isAuthRoute rule below) silently breaks recovery links.
  const isSessionFlowRoute = request.nextUrl.pathname.startsWith('/auth/callback') ||
                             request.nextUrl.pathname.startsWith('/update-password')

  // Public marketing page - accessible whether logged in or not.
  // "/" always renders the Welcome page (it redirects there), so it must stay public too.
  const isPublicRoute = request.nextUrl.pathname.startsWith('/welcome') ||
                        request.nextUrl.pathname === '/' ||
                        request.nextUrl.pathname === '/model-card' ||
                        request.nextUrl.pathname === '/api/ml/model-card'

  const isOnboardingRoute = request.nextUrl.pathname.startsWith('/onboarding')

  const isPatientArea = request.nextUrl.pathname === '/patient' || request.nextUrl.pathname.startsWith('/patient/')
  const isClinicalArea =
    request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/patients') ||
    request.nextUrl.pathname.startsWith('/appointments') ||
    request.nextUrl.pathname.startsWith('/doctors') ||
    request.nextUrl.pathname.startsWith('/alerts') ||
    request.nextUrl.pathname.startsWith('/analytics') ||
    request.nextUrl.pathname.startsWith('/assistant') ||
    request.nextUrl.pathname.startsWith('/predict') ||
    request.nextUrl.pathname.startsWith('/settings') ||
    request.nextUrl.pathname.startsWith('/about') ||
    request.nextUrl.pathname.startsWith('/contact') ||
    request.nextUrl.pathname.startsWith('/admin')

  // Only these known protected areas bounce a signed-out visitor to
  // /login. Anything else (a typo, a stale bookmark) falls through so
  // the app renders its 404 page instead of a sign-in wall.
  const isProtectedArea =
    isClinicalArea ||
    isPatientArea ||
    isOnboardingRoute ||
    request.nextUrl.pathname.startsWith('/pending-approval')

  // The former /admin-portal area was retired in favour of the single
  // in-dashboard admin at /admin. Keep old links/bookmarks working with a
  // redirect; the /admin area applies its own role checks from here on.
  if (request.nextUrl.pathname.startsWith('/admin-portal')) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    url.search = ''
    return redirectWithCookies(url)
  }

  if (!user && !isAuthRoute && !isPublicRoute && !isSessionFlowRoute && isProtectedArea) {
    const url = request.nextUrl.clone()
    // Remember the deep link so a successful sign-in can return the user
    // to the page they actually wanted (QA Round 3, auth L1). The login
    // page re-validates it against the signed-in role before honouring.
    const returnTo = request.nextUrl.pathname
    url.pathname = '/login'
    url.search = ''
    if (returnTo && returnTo !== '/') url.searchParams.set('next', returnTo)
    return redirectWithCookies(url)
  }

  // Role-based access control: patients get their own portal under /patient/*,
  // clinical staff (doctor/nurse/hospital_admin/super_admin/data_scientist) use
  // the existing /dashboard/* clinical workspace. Neither can reach the other's area.
  //
  // The profile read (and, for doctors, the approval-status read) only
  // happens when a routing decision below actually consumes it: the
  // auth-route bounce, the patient↔clinical area gates, the
  // unapproved-doctor gate and the null-profile onboarding gate. Public
  // pages, session-flow routes, onboarding, pending-approval and every
  // /api/* route pass through on the session refresh above alone — no
  // database work for requests that never branch on a role.
  const needsRoleRouting = Boolean(user) && (isAuthRoute || isClinicalArea || isPatientArea)
  let role: string | null = null
  let profileComplete = false
  let doctorStatus: string | null = null
  if (needsRoleRouting && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single()
    role = profile?.role ?? null
    profileComplete = Boolean(profile?.full_name && profile.full_name.trim().length > 0)

    // Doctor status feeds only the auth-route home redirect and the
    // unapproved-doctor clinical gate — not the patient-area gate.
    if (role === 'doctor' && (isAuthRoute || isClinicalArea)) {
      const { data: doctor } = await supabase
        .from('doctors')
        .select('status')
        .eq('user_id', user.id)
        .single()
      doctorStatus = doctor?.status ?? null
    }
  }

  const homeForRole = (r: string | null) => {
    if (r === 'patient') return '/patient/dashboard'
    if (r === 'doctor' && doctorStatus !== 'approved') return '/pending-approval'
    return '/dashboard'
  }

  // /forgot-password stays reachable while signed in (QA Round 3, auth
  // L2): a browser holding a live session for an account whose password
  // was forgotten — shared/family device, long-lived session — must be
  // able to request a reset without first guessing "sign out".
  const isForgotPassword = request.nextUrl.pathname.startsWith('/forgot-password')
  if (user && isAuthRoute && !isForgotPassword) {
    const url = request.nextUrl.clone()
    url.pathname = homeForRole(role)
    return redirectWithCookies(url)
  }

  if (user && role === 'patient' && isClinicalArea) {
    const url = request.nextUrl.clone()
    url.pathname = '/patient/dashboard'
    url.searchParams.set('error', 'This area is for doctors only.')
    return redirectWithCookies(url)
  }

  if (user && role && role !== 'patient' && isPatientArea) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.searchParams.set('error', 'This area is for patients only.')
    return redirectWithCookies(url)
  }

  // An unapproved doctor account must never reach the clinical workspace,
  // even if they type/bookmark a /dashboard URL directly.
  if (user && role === 'doctor' && doctorStatus !== 'approved' && isClinicalArea) {
    const url = request.nextUrl.clone()
    url.pathname = '/pending-approval'
    return redirectWithCookies(url)
  }

  if (user && !role && !isOnboardingRoute && (isClinicalArea || isPatientArea)) {
    // Authenticated but profile row not resolved yet (e.g. brand-new OAuth
    // signup, trigger hasn't finished) — send them to finish setup instead
    // of letting them fall through to a role-gated area with no role.
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding'
    return redirectWithCookies(url)
  }

  if (user && role && !profileComplete && !isOnboardingRoute && (isClinicalArea || isPatientArea)) {
    // Onboarding is not skippable (QA Round 3, onboarding O-3): a profile
    // that has a role but no name yet (e.g. an OAuth trigger coalescing
    // full_name to '') previously reached the full app half-set-up,
    // because this gate only fired when the role itself was missing.
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding'
    return redirectWithCookies(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
