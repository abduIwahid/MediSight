"use client"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, Eye, EyeOff } from "lucide-react"
import BrandMark from "@/components/shared/BrandMark"

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  // null = still checking, true = a session exists, false = no session
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  // A session is a RECOVERY session only if it arrived through a one-time
  // email link: either the in-page PASSWORD_RECOVERY event, or the marker
  // cookie the server callback sets on a recovery exchange (QA Round 3,
  // auth H2). Any other live session must re-prove the current password
  // below — a session alone must not be enough to take over the account.
  const [isRecovery, setIsRecovery] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const router = useRouter()

  const supabase = createClient()

  useEffect(() => {
    // The recovery link carries either session tokens (parsed by the
    // client on load) or an error in the URL hash when it has expired.
    if (window.location.hash.includes("error")) {
      setHasSession(false)
      return
    }
    if (document.cookie.split("; ").some((c) => c === "whyrisk_recovery=1")) {
      setIsRecovery(true)
    }
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setIsRecovery(true)
      if (session) setHasSession(true)
    })
    return () => listener.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    // 6 is the server-side truth: nothing in the project raises the
    // Supabase minimum above its default, and signup accepts 6. This
    // page used to demand 8, contradicting the rule users signed up
    // under (QA Round 2, F3). Raising the real policy to 8+ is a
    // one-line change in Supabase Auth config (Minimum password
    // length) — if that is ever done, raise this check and the
    // signup hint to match in the same change.
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }

    setLoading(true)
    setError(null)

    // Step-up for non-recovery sessions (QA Round 3, auth H2): verify the
    // current password before allowing the change, so momentary access
    // to a signed-in browser cannot become a permanent takeover.
    if (!isRecovery) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        setHasSession(false)
        setLoading(false)
        return
      }
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      if (reauthError) {
        setError("Your current password was not recognised. The password was not changed.")
        setLoading(false)
        return
      }
    }

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      // A missing/expired recovery session surfaces here as a provider
      // session error — show the friendly expired state, not the raw text.
      if (/session/i.test(error.message)) {
        setHasSession(false)
      } else if (/password/i.test(error.message)) {
        setError("That password doesn't meet the requirements. Use at least 6 characters.")
      } else {
        // Never render the raw provider message (QA Round 2, security L1).
        console.error("Password update failed:", error.message)
        setError("Your password could not be updated. Please try again.")
      }
    } else {
      setDone(true)
      // The recovery marker is single-purpose — clear it, and revoke the
      // user's OTHER sessions so a reset actually locks out whoever
      // prompted it (QA Round 3, auth H2).
      document.cookie = "whyrisk_recovery=; path=/update-password; max-age=0"
      await supabase.auth.signOut({ scope: "others" })
      // Destination mirrors the auth callback's canonical mapping
      // (QA Round 3, auth L3): no profile → onboarding, unapproved
      // doctor → pending-approval, patient → patient home.
      const { data: { user } } = await supabase.auth.getUser()
      let destination = "/dashboard"
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()
        if (!profile) {
          destination = "/onboarding"
        } else if (profile.role === "patient") {
          destination = "/patient/dashboard"
        } else if (profile.role === "doctor") {
          const { data: doctor } = await supabase
            .from("doctors")
            .select("status")
            .eq("user_id", user.id)
            .single()
          if (doctor?.status !== "approved") destination = "/pending-approval"
        }
      }
      setTimeout(() => router.push(destination), 2500)
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 bg-muted/30 px-4 py-10">
      <div className="flex items-center gap-2.5">
        <BrandMark className="h-10 w-10 shrink-0" />
        <span className="text-xl font-bold tracking-tight">WhyRisk</span>
      </div>
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl border shadow-card">
        {hasSession === null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Checking your link…</p>
        ) : hasSession === false ? (
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            <div>
              <h1 className="text-2xl font-bold">This link has expired</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Password reset links can only be used once. Request a new one to continue.
              </p>
            </div>
            <Link href="/forgot-password">
              <Button variant="outline" className="mt-2">Request a new link</Button>
            </Link>
          </div>
        ) : done ? (
          <div role="status" className="flex flex-col items-center text-center space-y-4 py-4">
            <CheckCircle2 className="h-14 w-14 text-[#1E7A46]" />
            <div>
              <h1 className="text-2xl font-bold">Password updated!</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Your password has been changed, and your other devices have been signed out. Redirecting you to your workspace…
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">Set a new password</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Choose a strong password for your WhyRisk account.
              </p>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4">
              {!isRecovery && (
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    You are signed in, so we ask for your current password before making this change. If you arrived from a password reset email, this step is skipped.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Re-enter your new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(prev => !prev)}
                    className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && <div role="alert" className="text-destructive text-sm">{error}</div>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating…" : "Update Password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
