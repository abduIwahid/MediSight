"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PulseLoader } from "@/components/shared/PulseLoader"
import { AvatarUploader } from "@/components/shared/AvatarUploader"

export default function PatientProfilePage() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [gender, setGender] = useState("")
  const [dob, setDob] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [hospitalName, setHospitalName] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sessionError, setSessionError] = useState(false)
  const [loadError, setLoadError] = useState(false)
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
      setUserId(user.id)

      // Independent reads run together (QA Round 3, perf P-8). Load
      // failures surface as an error state instead of a blank form
      // (QA Round 3, profile M4 / states F-09): a missing
      // patient_profiles row (PGRST116) is a genuine empty, not an
      // error — the save upserts it.
      const [profileRes, patientRes] = await Promise.all([
        supabase.from("profiles").select("full_name, email, avatar_url, hospital_id").eq("id", user.id).single(),
        supabase
          .from("patient_profiles")
          .select("phone, gender, date_of_birth")
          .eq("user_id", user.id)
          .single(),
      ])
      const profile = profileRes.data
      if (profileRes.error) {
        console.error("Profile failed to load:", profileRes.error)
        setLoadError(true)
      }
      if (profile) {
        setFullName(profile.full_name || "")
        setEmail(profile.email || user.email || "")
        setAvatarUrl(profile.avatar_url || null)
        if (profile.hospital_id) {
          const { data: hospital } = await supabase.from("hospitals").select("name").eq("id", profile.hospital_id).single()
          if (hospital) setHospitalName(hospital.name)
        }
      }
      if (patientRes.error && patientRes.error.code !== "PGRST116") {
        console.error("Patient profile failed to load:", patientRes.error)
        setLoadError(true)
      }
      const patientProfile = patientRes.data
      if (patientProfile) {
        setPhone(patientProfile.phone || "")
        // Stored values are title-case in older rows while the select
        // options are lowercase (QA Round 3, profile M6) — normalise on
        // load or an existing value renders as "not set".
        setGender((patientProfile.gender || "").toLowerCase())
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

    // A date of birth in the future poisons every age derived from it
    // (QA Round 3, profile L2).
    if (dob && dob > new Date().toISOString().slice(0, 10)) {
      setSaveError("Your date of birth cannot be in the future.")
      setSaving(false)
      return
    }

    // Sequential, VERIFIED writes with per-part reporting (QA Round 3,
    // profile H1/M4, data-integrity DI3-10): a zero-row update returns
    // no error, so success is only claimed when a row comes back. The
    // phone is written to profiles.contact_number in the same update —
    // that is the column clinician screens read (profile H2 / DI3-08);
    // patient_profiles.phone stays as the patient-side copy.
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: fullName, contact_number: phone || null })
      .eq("id", user.id)
      .select("id")
    if (profileError || !profileRows || profileRows.length === 0) {
      console.error("Profile save failed:", profileError)
      setSaveError("Your name and phone could not be saved. Please try again.")
      setSaving(false)
      return
    }

    const { data: patientRows, error: patientError } = await supabase
      .from("patient_profiles")
      .upsert({
        user_id: user.id,
        phone,
        gender: gender || null,
        date_of_birth: dob || null,
      })
      .select("user_id")
    if (patientError || !patientRows || patientRows.length === 0) {
      console.error("Patient profile save failed:", patientError)
      setSaveError("Your name and phone were saved, but your date of birth and gender were not. Please try again.")
      setSaving(false)
      return
    }

    setSaved(true)
    setSaving(false)
  }

  // The avatar persists the moment the upload finishes (QA Round 3,
  // profile H4) — not as a side effect of a later Save click.
  const handleAvatarUpload = async (url: string) => {
    setAvatarUrl(url)
    if (!userId) return
    const { data, error } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", userId)
      .select("id")
    if (error || !data || data.length === 0) {
      console.error("Avatar save failed:", error)
      setSaveError("Your photo was uploaded but could not be saved to your profile. Please try again.")
    }
  }

  if (loading) return <PulseLoader label="Loading your profile" />

  if (sessionError) {
    return (
      <div role="alert" className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive-text">
        Your session has ended. Please{" "}
        <Link href="/login" className="font-semibold underline">sign in again</Link>{" "}
        to manage your profile.
      </div>
    )
  }

  if (loadError) {
    return (
      <div role="alert" className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive-text">
        Your profile could not be loaded. Please{" "}
        <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">reload the page</button>{" "}
        to try again.
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">Manage your personal information.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5 rounded-xl border bg-card p-6 shadow-card">
        {userId && (
          <AvatarUploader url={avatarUrl} uid={userId} name={fullName} onUpload={handleAvatarUpload} />
        )}

        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dob">Date of birth</Label>
            <Input id="dob" type="date" max={new Date().toISOString().slice(0, 10)} value={dob} onChange={(e) => setDob(e.target.value)} />
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Account type</Label>
            <Input value="Patient" disabled className="opacity-70" />
          </div>
          <div className="space-y-2">
            <Label>Hospital</Label>
            <Input value={hospitalName || "Not assigned yet"} disabled className="opacity-70" />
          </div>
        </div>

        {saveError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">{saveError}</div>}
        {saved && <div role="status" className="rounded-xl border border-[#1E7A46]/30 bg-[#E2F0E6] px-4 py-3 text-sm text-[#1E7A46]">Profile updated.</div>}

        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </form>

      <div className="rounded-xl border bg-card p-6 shadow-card">
        <p className="font-semibold">Password</p>
        <p className="mt-1 text-sm text-muted-foreground">
          To change your password, we will first ask for your current one.
        </p>
        <Link href="/update-password" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          Change your password
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-card">
        <p className="font-semibold">Are you a doctor?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          If you are a medical professional, you can apply for access to the Doctor Portal. An administrator reviews every application.
        </p>
        <Link href="/onboarding/doctor" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          Apply for the Doctor Portal
        </Link>
      </div>
    </div>
  )
}
