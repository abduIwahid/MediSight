"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2 } from "lucide-react"

// In-app change-password (QA Round 3, profile H3/M5): until now the
// only password page was the email-recovery one, so a signed-in user
// who simply wanted to change their password had no path at all. The
// current password is verified by re-authenticating before the change
// is applied.
export function ChangePasswordCard({ email }: { email: string }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (next !== confirm) {
      setError("The new passwords do not match.")
      return
    }
    if (next.length < 6) {
      setError("Your new password must be at least 6 characters.")
      return
    }
    setSaving(true)
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    })
    if (reauthError) {
      setError("Your current password was not recognised. The password was not changed.")
      setSaving(false)
      return
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: next })
    if (updateError) {
      console.error("Password change failed:", updateError.message)
      setError("Your password could not be changed. Please try again.")
      setSaving(false)
      return
    }
    setCurrent("")
    setNext("")
    setConfirm("")
    setDone(true)
    setSaving(false)
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-card">
      <h2 className="text-lg font-semibold">Password</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Change the password you sign in with. Your other devices stay signed in.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="cp-current">Current password</Label>
          <Input
            id="cp-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cp-next">New password</Label>
          <Input
            id="cp-next"
            type="password"
            autoComplete="new-password"
            placeholder="Min. 6 characters"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cp-confirm">Confirm new password</Label>
          <Input
            id="cp-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        {error && (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
            {error}
          </div>
        )}
        {done && (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-[#1E7A46]/30 bg-[#E2F0E6] px-4 py-3 text-sm text-[#1E7A46]">
            <CheckCircle2 className="h-4 w-4" /> Password changed.
          </div>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Changing…" : "Change Password"}
        </Button>
      </form>
    </div>
  )
}
