"use client"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { CheckCircle2, ArrowLeft } from "lucide-react"
import BrandMark from "@/components/shared/BrandMark"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const supabase = createClient()

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Route the recovery link through the server callback (QA Round 3,
    // auth H1): pointing it straight at /update-password made the flow
    // depend on the requesting browser's PKCE verifier cookie, so a
    // fresh link opened on another device/browser failed and was
    // falsely reported as "expired". The callback exchanges the code /
    // verifies the token server-side (its type=recovery branch routes
    // to /update-password and marks the recovery session).
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback`,
    })

    if (error) {
      // Never render the raw provider message (QA Round 2, security
      // L1). Rate-limit is the one case worth naming; the rest get one
      // honest sentence and the detail goes to the console.
      if (/rate|too many/i.test(error.message)) {
        setError("Too many reset requests for now. Please wait a few minutes and try again.")
      } else {
        console.error("Password reset failed:", error.message)
        setError("The reset email could not be sent. Please check the address and try again.")
      }
    } else {
      setSent(true)
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
        {sent ? (
          <div role="status" className="flex flex-col items-center text-center space-y-4 py-4">
            <CheckCircle2 className="h-14 w-14 text-[#1E7A46]" />
            <div>
              <h1 className="text-2xl font-bold">Check your email</h1>
              <p className="text-sm text-muted-foreground mt-2">
                We&apos;ve sent a password reset link to <strong>{email}</strong>.
                Follow the link to set a new password.
              </p>
            </div>
            <Link href="/login">
              <Button variant="outline" className="mt-2">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Sign In
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">Reset your password</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>
            </div>

            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {error && <div role="alert" className="text-destructive text-sm">{error}</div>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Send Reset Link"}
              </Button>
            </form>

            <div className="text-center text-sm">
              <Link href="/login" className="inline-flex items-center gap-1 text-primary hover:underline">
                <ArrowLeft className="h-3 w-3" /> Back to Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
