"use client"
import { useState, type FormEvent, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { AtSign, Lock, Eye, EyeOff } from "lucide-react"
import { motion } from "framer-motion"
import BrandMark from "@/components/shared/BrandMark"

// Google sign-in is NOT enabled in the Supabase project yet — rendering
// the button sends users to a raw provider error page. The OAuth code
// path below stays intact; flip this to true once the provider is
// configured in Supabase Auth.
const GOOGLE_OAUTH_ENABLED = false

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const [portal, setPortal] = useState<"patient" | "doctor">("patient")
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<"google" | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  // The ?error= param is user-editable text in a URL — only ever render
  // the exact messages this app itself produces (middleware portal
  // guards, the auth callback). Anything else is treated as no message,
  // so a crafted link can't put arbitrary "official" text on the
  // sign-in page.
  const ALLOWED_URL_ERRORS = new Set([
    "This area is for doctors only.",
    "This area is for patients only.",
    "Could not confirm your account. Please try again.",
  ])
  const rawUrlError = searchParams.get("error")
  const callbackError = rawUrlError && ALLOWED_URL_ERRORS.has(rawUrlError) ? rawUrlError : null

  const supabase = createClient()

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const credentials = identifier.includes("@")
      ? { email: identifier, password }
      : { phone: identifier, password }

    const { data, error } = await supabase.auth.signInWithPassword(credentials)

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Enforced again server-side by middleware — this just gives a fast,
    // portal-specific error instead of a silent redirect after the fact.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single()

    const staffRoles = ["doctor", "super_admin", "hospital_admin", "nurse", "data_scientist"]
    const actualRole = profile?.role

    if (portal === "doctor" && (!actualRole || !staffRoles.includes(actualRole))) {
      await supabase.auth.signOut()
      setError("This account is registered as a Patient. Please sign in through the Patient Portal.")
      setLoading(false)
      return
    }

    if (portal === "patient" && actualRole !== "patient") {
      await supabase.auth.signOut()
      setError("This account is registered as a Doctor. Please sign in through the Doctor Portal.")
      setLoading(false)
      return
    }

    if (actualRole === "doctor") {
      const { data: doctor } = await supabase
        .from("doctors")
        .select("status")
        .eq("user_id", data.user.id)
        .single()

      if (doctor?.status === "pending") {
        await supabase.auth.signOut()
        setError("Your account is awaiting administrator approval.")
        setLoading(false)
        return
      }
      if (doctor?.status === "rejected") {
        await supabase.auth.signOut()
        setError("Your doctor registration has been rejected. Please contact the administrator.")
        setLoading(false)
        return
      }
    }

    router.push(actualRole === "patient" ? "/patient/dashboard" : "/dashboard")
    router.refresh()
    setLoading(false)
  }

  const handleOAuth = async (provider: "google") => {
    setOauthLoading(provider)
    setError(null)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    // No explicit `next` here — /auth/callback resolves the right home by
    // the user's actual role/status, whether they're a patient, a returning
    // approved doctor, or (for a first-time Google doctor signup)
    // gets routed into the doctor verification form automatically.
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${siteUrl}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setOauthLoading(null)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }} className="relative flex min-h-screen w-full items-center justify-center bg-background px-4 py-10">
      <div className="relative z-10 grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-2xl border border-border shadow-premium md:grid-cols-2">
        {/* Brand / marketing panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-white md:flex">
          <BrandMark variant="glyph" className="pointer-events-none absolute -bottom-14 -right-10 h-72 w-72 opacity-[0.06]" />
          <div className="relative z-10 flex items-center gap-2.5">
            <BrandMark variant="glyph" className="h-10 w-10 shrink-0" />
            <span className="text-xl font-bold tracking-tight">WhyRisk</span>
          </div>
          <div className="relative z-10 space-y-5">
            <h2 className="font-heading text-3xl font-bold leading-tight">
              Clinical intelligence, delivered with confidence.
            </h2>
            <p className="max-w-sm text-sm leading-6 text-white/80">
              Predictive risk models, explainable AI, and real-time patient insights — all in one secure workspace built for modern care teams.
            </p>
            <ul className="space-y-3 text-sm text-white/85">
              <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand" /> Early disease risk prediction</li>
              <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand" /> SHAP-powered explainability</li>
              <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand" /> Row-level security on every record</li>
            </ul>
          </div>
          <p className="relative z-10 text-xs text-white/60">One workspace for patients, doctors and admins.</p>
        </div>

        {/* Form panel */}
        <div className="flex flex-col justify-center bg-card px-8 py-10 md:px-12 md:py-12">
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="eyebrow">Welcome back</p>
              <h1 className="font-heading text-3xl font-bold text-foreground">Sign in to your workspace</h1>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Securely access your AI healthcare workspace and resume your patient insights in one place.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => { setPortal("patient"); setError(null) }}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  portal === "patient" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                }`}
              >
                Patient Portal
              </button>
              <button
                type="button"
                onClick={() => { setPortal("doctor"); setError(null) }}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  portal === "doctor" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                }`}
              >
                Doctor Portal
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="identifier">Email or Phone</Label>
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 px-3 py-3 transition-all duration-200 hover:border-primary/40 hover:bg-muted/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                  <AtSign className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <Input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="Enter your email or phone number"
                    required
                    className="border-0 bg-transparent px-0 text-sm placeholder:text-muted-foreground focus-visible:ring-0 [&::-ms-clear]:hidden [&::-ms-reveal]:hidden"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 px-3 py-3 transition-all duration-200 hover:border-primary/40 hover:bg-muted/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                  <Lock className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="border-0 bg-transparent px-0 text-sm placeholder:text-muted-foreground focus-visible:ring-0 [&::-ms-clear]:hidden [&::-ms-reveal]:hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex items-center gap-2 text-sm text-foreground/80">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  Remember me
                </label>
                <span className="text-sm text-muted-foreground">Secure session</span>
              </div>

              {callbackError && <div className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{callbackError}</div>}
              {error && <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

              <Button type="submit" className="w-full py-3" disabled={loading}>
                {loading ? "Signing in..." : portal === "doctor" ? "Sign In as Doctor" : "Sign In"}
              </Button>
            </form>

            {GOOGLE_OAUTH_ENABLED && (
              <>
                <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> or continue with <span className="h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    onClick={() => handleOAuth("google")}
                    disabled={oauthLoading !== null}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-all duration-200 hover:-translate-y-px hover:bg-muted hover:shadow-md disabled:opacity-60"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.05H2.18a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.85C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                    Google
                  </button>
                </div>
                {portal === "doctor" && (
                  <p className="text-center text-xs text-muted-foreground">
                    Signing in as a doctor for the first time via Google? You&apos;ll be asked to complete a short verification form.
                  </p>
                )}
              </>
            )}

            <div className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="font-medium text-primary hover:underline">
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
