"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PulseLoader } from "@/components/shared/PulseLoader"

export default function PatientProfilePage() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [gender, setGender] = useState("")
  const [dob, setDob] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sessionError, setSessionError] = useState(false)
  // Success and error are SEPARATE states. They used to share one
  // message rendered in a green success box, so a failed save displayed
  // its raw database error styled as success (QA Round 1, item 42).
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setSessionError(true)
        setLoading(false)
        return
      }

      const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).single()
      if (profile) {
        setFullName(profile.full_name || "")
        setEmail(profile.email || user.email || "")
      }

      const { data: patientProfile } = await supabase
        .from("patient_profiles")
        .select("phone, gender, date_of_birth")
        .eq("user_id", user.id)
        .single()
      if (patientProfile) {
        setPhone(patientProfile.phone || "")
        setGender(patientProfile.gender || "")
        setDob(patientProfile.date_of_birth || "")
      }

      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // The old code returned here without clearing `saving`, leaving
      // the button stuck on "Saving..." forever.
      setSessionError(true)
      setSaving(false)
      return
    }

    const [{ error: profileError }, { error: patientError }] = await Promise.all([
      supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id),
      supabase.from("patient_profiles").upsert({
        user_id: user.id,
        phone,
        gender: gender || null,
        date_of_birth: dob || null,
      }),
    ])

    if (profileError || patientError) {
      console.error("Profile save failed:", profileError || patientError)
      setSaveError("Your changes could not be saved. Please check your connection and try again.")
    } else {
      setSaved(true)
    }
    setSaving(false)
  }

  if (loading) return <PulseLoader label="Loading your profile" />

  if (sessionError) {
    return (
      <div role="alert" className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
        Your session has ended. Please{" "}
        <Link href="/login" className="font-semibold underline">sign in again</Link>{" "}
        to manage your profile.
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">Manage your personal information.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input id="phone" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dob">Date of birth</Label>
            <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gender-select">Gender</Label>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger id="gender-select">
              <SelectValue placeholder="Select (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="other">Other</SelectItem>
              <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={email} disabled className="opacity-70" />
          <p className="text-xs text-muted-foreground">Your email is set when your account is created and can&apos;t be changed here.</p>
        </div>

        {saveError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{saveError}</div>}
        {saved && <div role="status" className="rounded-xl border border-[#1E7A46]/30 bg-[#E2F0E6] px-4 py-3 text-sm text-[#1E7A46]">Profile updated.</div>}

        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </div>
  )
}
