"use client"
import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import BrandMark from "@/components/shared/BrandMark"

export default function OnboardingPage() {
  const [fullName, setFullName] = useState("")
  const [hospitalId, setHospitalId] = useState("")
  const [hospitals, setHospitals] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Check if profile is already complete
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
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
    // and hospital.
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fullName,
      hospital_id: hospitalId || null
    })

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

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>

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
          </div>

          {error && <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving..." : "Complete Setup"}
          </Button>
        </form>
      </div>
    </div>
  )
}
