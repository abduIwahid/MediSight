"use client"
import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import type { ProfileRow } from "@/lib/types"
import { AvatarUploader } from "./AvatarUploader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createBrowserClient } from "@supabase/ssr"
import { CheckCircle2, Mail, Shield, Building2, Phone, Stethoscope } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ROLE_BADGE_CLASSES, roleLabel } from "@/lib/roles"

const SPECIALTIES = [
  "General Practice", "Cardiology", "Endocrinology", "Nephrology",
  "Neurology", "Oncology", "Pulmonology", "Internal Medicine",
  "Emergency Medicine", "Radiology", "Pathology", "Data Science"
]

export function ProfileForm({ user, profile, hospitalName }: {
  user: User
  profile: ProfileRow | null
  /** Name of the hospital the profile is assigned to (resolved by the
   *  settings page). Assignment itself is admin-only — see the
   *  read-only Hospital Assignment field below. */
  hospitalName?: string | null
}) {
  const [fullName, setFullName] = useState(profile?.full_name || "")
  const [department, setDepartment] = useState(profile?.department || "")
  const [specialty, setSpecialty] = useState(profile?.specialty || "")
  // The profile phone number lives in `contact_number` — the column
  // the admin API writes (QA Round 2, cluster 21). This form used to
  // read/write the legacy `phone` column, so self-service edits and
  // admin edits landed in different columns and drifted apart.
  const [phone, setPhone] = useState(profile?.contact_number || "")
  const [bio, setBio] = useState(profile?.bio || "")
  const [consultationFee, setConsultationFee] = useState(profile?.consultation_fee ? String(profile.consultation_fee) : "")
  const [servicesString, setServicesString] = useState(Array.isArray(profile?.services) ? profile.services.join(", ") : "")
  // Availability has ONE source of truth: availability_status (QA Round 1,
  // item 89). The legacy `available` bool is still written, derived from
  // the status, so nothing downstream can disagree with it.
  const [availabilityStatus, setAvailabilityStatus] = useState(
    profile?.availability_status || (profile?.available === false ? "busy" : "available")
  )
  const isDoctor = profile?.role === "doctor"

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      // hospital_id is deliberately NOT written here: hospital
      // assignment decides which hospital's patients a user can see,
      // so it is set by administrators in User Management only. This
      // form used to offer every signed-in user a picker of all
      // hospitals — self-service cross-hospital access (QA Round 2,
      // cluster 12). Migration 20261025230000 adds the matching DB
      // guard for writes that bypass this form.
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          department,
          specialty,
          contact_number: phone,
          bio,
          availability_status: availabilityStatus,
          available: availabilityStatus === "available",
          consultation_fee: consultationFee ? Number(consultationFee) : null,
          services: servicesString.split(',').map((item: string) => item.trim()).filter(Boolean),
          avatar_url: avatarUrl,
        })
        .eq("id", user.id)

      if (error) throw error
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      console.error("Profile save failed:", e)
      setError("Unable to save your profile. Please check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Profile preview header */}
      <div className="flex items-center gap-5 pb-6 border-b">
        <AvatarUploader uid={user.id} url={avatarUrl} name={fullName} onUpload={(url) => setAvatarUrl(url)} />
        <div>
          <h2 className="text-xl font-bold">{fullName || "Your Name"}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge className={`border text-xs ${ROLE_BADGE_CLASSES[profile?.role ?? ""] || "bg-muted text-muted-foreground border-border"}`}>
              <Shield className="h-2.5 w-2.5 mr-1" />
              {roleLabel(profile?.role)}
            </Badge>
            {specialty && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Stethoscope className="h-3 w-3" /> {specialty}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            <Mail className="h-3 w-3" /> {user.email}
          </p>
        </div>
      </div>

      {/* Read-only account info */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Account Info</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Email Address</Label>
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {user.email}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">System Role</Label>
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              {profile?.role ? roleLabel(profile.role) : "Unassigned"}
              <span className="text-xs text-muted-foreground/60 ml-1">(managed by admin)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Personal info fields */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Personal Details</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              autoComplete="name"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Ayesha Khan"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">
              <Phone className="h-3.5 w-3.5 inline mr-1" /> Phone Number
            </Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+92 300 1234567"
            />
            <p className="text-xs text-muted-foreground">Format example: +92 300 1234567</p>
          </div>
        </div>
      </div>

      {/* Clinical info fields */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Clinical Information</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {isDoctor && (
          <div className="space-y-2">
            <Label htmlFor="specialty">
              <Stethoscope className="h-3.5 w-3.5 inline mr-1" /> Specialty
            </Label>
            <Select value={specialty} onValueChange={setSpecialty}>
              <SelectTrigger id="specialty">
                <SelectValue placeholder="Select specialty" />
              </SelectTrigger>
              <SelectContent>
                {SPECIALTIES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="department">
              <Building2 className="h-3.5 w-3.5 inline mr-1" /> Department
            </Label>
            <Input
              id="department"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              placeholder="e.g. Cardiology Ward B"
            />
          </div>
          <div className="space-y-2">
            <Label>Hospital Assignment</Label>
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              {hospitalName || profile?.hospitals?.name || "Unassigned"}
              <span className="text-xs text-muted-foreground/60 ml-1">(assigned by admin)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Your hospital decides which patients you can see. To change it, ask an administrator — they manage assignments in User Management.
            </p>
          </div>
        </div>

        {isDoctor && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Doctor Profile</h3>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="availabilityStatus">Availability</Label>
              <Select value={availabilityStatus} onValueChange={setAvailabilityStatus}>
                <SelectTrigger id="availabilityStatus">
                  <SelectValue placeholder="Select availability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available — accepting new patients</SelectItem>
                  <SelectItem value="busy">Busy — not taking new bookings</SelectItem>
                  <SelectItem value="on_leave">On leave</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">This is the status patients see when booking.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="consultationFee">Consultation Fee (PKR)</Label>
              <Input
                id="consultationFee"
                type="number"
                value={consultationFee}
                onChange={(e) => setConsultationFee(e.target.value)}
                placeholder="e.g. 1500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="services">Services / Specialties</Label>
              <Input
                id="services"
                value={servicesString}
                onChange={(e) => setServicesString(e.target.value)}
                placeholder="e.g. Diabetes care, Hypertension follow-up"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Profile Summary</Label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="min-h-[120px] w-full rounded-md border border-input bg-input px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="Describe your specialties, clinical philosophy, and experience."
              />
            </div>
          </div>
        </div>
        )}
      </div>



      {/* Footer */}
      {error && (
        <div role="alert" className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-[#1E7A46]">
            <CheckCircle2 className="h-4 w-4" /> Profile updated!
          </span>
        )}
      </div>
    </div>
  )
}
