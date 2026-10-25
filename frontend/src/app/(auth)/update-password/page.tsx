"use client"
import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
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
  // null = still checking, true = valid recovery session, false = no session
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    // The recovery link carries either session tokens (parsed by the
    // client on load) or an error in the URL hash when it has expired.
    if (window.location.hash.includes("error")) {
      setHasSession(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
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
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }

    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      // A missing/expired recovery session surfaces here as a provider
      // session error — show the friendly expired state, not the raw text.
      if (/session/i.test(error.message)) {
        setHasSession(false)
      } else {
        setError(error.message)
      }
    } else {
      setDone(true)
      const { data: { user } } = await supabase.auth.getUser()
      let destination = "/dashboard"
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()
        if (profile?.role === "patient") destination = "/patient/dashboard"
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
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl border shadow-sm">
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
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <div>
              <h1 className="text-2xl font-bold">Password updated!</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Your password has been changed. Redirecting you to your workspace…
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
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Min. 8 characters"
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

              {error && <div className="text-destructive text-sm">{error}</div>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
