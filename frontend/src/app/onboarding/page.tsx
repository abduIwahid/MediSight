"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import BrandMark from "@/components/shared/BrandMark"
import { PulseLoader } from "@/components/shared/PulseLoader"

export default function OnboardingPage() {
  const [fullName, setFullName] = useState("")
  const [hospitalId, setHospitalId] = useState("")
  const [profileRole, setProfileRole] = useState<string | null>(null)
  const [hospitals, setHospitals] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hospitalsError, setHospitalsError] = useState(false)
  const router = useRouter()

  const supabase = createClient()

  // See handleSubmit for the reasoning: only patients pick a hospital
  // here. Doctors declare their hospital at signup and the scoped
  // assignment is confirmed by an administrator at approval;
  // provisioned staff roles get theirs from an administrator.
  const canSelfSelectHospital = !profileRole || profileRole === 'patient'

  useEffect(() => {
    async function loadData() {
      // try/catch/finally (QA Round 3, states F-13): a rejected promise
      // anywhere in this chain used to leave the PulseLoader spinning
      // forever with no error and no recovery.
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        // Check if profile is already complete
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        if (profile?.role) setProfileRole(profile.role)
        if (profile && profile.full_name) {
          router.push(profile.role === 'patient' ? '/patient/dashboard' : '/dashboard')
          return
        }

        await loadHospitals()
      } catch (err) {
        console.error("Onboarding load failed:", err)
        setLoadError("Your profile could not be loaded. Please reload the page to try again.")
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // The hospitals fetch error must not be swallowed (QA Round 3,
  // onboarding O-12): a failed load used to render as an empty dropdown
  // that simply looked like "no hospitals exist".
  const loadHospitals = async () => {
    const { data: hs, error: hsError } = await supabase.from('hospitals').select('id, name')
    if (hsError) {
      console.error("Hospitals load failed:", hsError)
      setHospitalsError(true)
      return
    }
    setHospitalsError(false)
    if (hs) setHospitals(hs)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError("Your session has expired. Please sign in again.")
      setSaving(false)
      return
    }

    // Role is intentionally NOT set here when a profile already has one —
    // it's assigned once at signup (from the Patient/Doctor choice) and
    // can only be changed by an admin from then on. The one exception is
    // a profile-less account (first-run insert): the row must state its
    // role explicitly, because the profiles table default was 'doctor'
    // until migration 20 (QA Round 3, onboarding O-5). OAuth signups are
    // patient accounts by design in this product, so the insert branch
    // writes role: 'patient' — never the database default.
    //
    // Hospital writes (QA Round 3, onboarding O-1 / adversarial F2 /
    // data-integrity DI3-14):
    // - Doctors never write profiles.hospital_id here. Their declared
    //   affiliation already lives in doctors.hospital (free text from
    //   signup); the scoped assignment is made by the administrator at
    //   approval time in Doctor Verification.
    // - Patients may pick their care hospital, and the key is only sent
    //   when a selection was actually made — an untouched picker must
    //   not overwrite an existing assignment with null.
    // - Provisioned staff roles never write hospital_id here (QA
    //   Round 2, cluster 12).
    const upsertPayload: { id: string; full_name: string; role?: string; hospital_id?: string } = {
      id: user.id,
      full_name: fullName,
    }
    if (!profileRole) {
      upsertPayload.role = 'patient'
    }
    if ((profileRole === 'patient' || !profileRole) && hospitalId) {
      upsertPayload.hospital_id = hospitalId
    }
    const { error: upsertError } = await supabase.from('profiles').upsert(upsertPayload)

    if (upsertError) {
      // A failed save must NOT look like success — previously the page
      // redirected back here and the user looped with no explanation.
      console.error("Profile save failed:", upsertError)
      setError("We couldn't save your profile. Please try again.")
      setSaving(false)
      return
    }

    // A first-run patient also needs their patient_profiles row (the
    // signup trigger normally creates it; a profile-less account may not
    // have one). Best-effort: the profile page upserts it on save too.
    if (!profileRole || profileRole === 'patient') {
      await supabase
        .from('patient_profiles')
        .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    router.push(profile?.role === 'patient' ? '/patient/dashboard' : '/dashboard')
    router.refresh()
    setSaving(false)
  }

  if (loading) return <div className="flex h-dvh items-center justify-center"><PulseLoader label="Loading onboarding" /></div>

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 bg-muted/30 px-4 py-10">
      <div className="flex items-center gap-2.5">
        <BrandMark className="h-10 w-10 shrink-0" />
        <span className="text-xl font-bold tracking-tight">WhyRisk</span>
      </div>
      <div className="w-full max-w-md p-5 sm:p-8 space-y-6 bg-card rounded-xl border shadow-card">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Complete your profile</h1>
          <p className="text-sm text-muted-foreground mt-2">Welcome to WhyRisk</p>
        </div>
        {loadError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">{loadError}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full-name">Full Name</Label>
            <Input id="full-name" value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" required />
          </div>
          {canSelfSelectHospital ? (
            <div className="space-y-2">
              <Label htmlFor="hospital">Hospital (Optional)</Label>
              <Select value={hospitalId} onValueChange={setHospitalId}>
                <SelectTrigger id="hospital" aria-label="Hospital (Optional)">
                  <SelectValue placeholder="Select a hospital" />
                </SelectTrigger>
                <SelectContent>
                  {hospitals.map(h => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hospitalsError && (
                <p role="alert" className="text-xs text-destructive">
                  The hospital list could not be loaded.{" "}
                  <button type="button" className="underline" onClick={() => void loadHospitals()}>
                    Try again
                  </button>{" "}
                  — or continue without choosing; you can book with any doctor.
                </p>
              )}
            </div>
          ) : profileRole === 'doctor' ? (
            <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              The hospital you named on your application is confirmed by an administrator when your application is approved — it will appear in your profile once set.
            </div>
          ) : (
            <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Your hospital is assigned by an administrator — it will appear in your profile once set.
            </div>
          )}

          {error && <div role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive-text">{error}</div>}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Complete Setup"}
          </Button>
        </form>
      </div>
    </div>
  )
}
