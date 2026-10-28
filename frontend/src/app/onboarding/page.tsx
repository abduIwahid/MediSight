"use client"
import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
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
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // See handleSubmit for the reasoning: only the self-signup roles may
  // pick a hospital here; provisioned staff roles get theirs from an
  // administrator.
  const canSelfSelectHospital =
    !profileRole || profileRole === 'patient' || profileRole === 'doctor'

  useEffect(() => {
    async function loadData() {
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

      // Load hospitals
      const { data: hs } = await supabase.from('hospitals').select('*')
      if (hs) setHospitals(hs)
      
      setLoading(false)
    }
    loadData()
  }, [])

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

    // Role is intentionally NOT set here — it's assigned once at signup
    // (from the Patient/Doctor choice) and can only be changed by an
    // admin from then on. This form only completes the profile's name
    // and (for self-signup roles) hospital.
    //
    // Hospital self-selection is honoured ONLY for the two self-signup
    // roles: a patient picking their care hospital, and a doctor
    // applicant declaring their affiliation — which stays inert for
    // clinical access until an admin approves the application
    // (migration 20261025230000 makes approval a condition of the
    // clinical RLS policies). Accounts with provisioned staff roles
    // (nurse, hospital_admin, super_admin, data_scientist) never write
    // hospital_id here: their assignment comes from an administrator
    // in User Management (QA Round 2, cluster 12).
    const upsertPayload: { id: string; full_name: string; hospital_id?: string | null } = {
      id: user.id,
      full_name: fullName,
    }
    if (canSelfSelectHospital) {
      upsertPayload.hospital_id = hospitalId || null
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
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-xl border shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Complete your profile</h1>
          <p className="text-sm text-muted-foreground mt-2">Welcome to WhyRisk</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" required />
          </div>
          {canSelfSelectHospital ? (
            <div className="space-y-2">
              <Label>Hospital (Optional)</Label>
              <Select value={hospitalId} onValueChange={setHospitalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a hospital" />
                </SelectTrigger>
                <SelectContent>
                  {hospitals.map(h => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profileRole === 'doctor' && (
                <p className="text-xs text-muted-foreground">
                  This is the hospital you are applying to join. An administrator confirms your assignment when they approve your application.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Your hospital is assigned by an administrator — it will appear in your profile once set.
            </div>
          )}

          {error && <div role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving..." : "Complete Setup"}
          </Button>
        </form>
      </div>
    </div>
  )
}
