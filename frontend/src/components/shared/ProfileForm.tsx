"use client"
import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import type { ProfileRow } from "@/lib/types"
import { AvatarUploader } from "./AvatarUploader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
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
  // the status, so nothing downstream can disagree with it. The initial
  // value comes from availability_status ONLY (QA Round 3, patient F10):
  // deriving it from the legacy bool contradicted the status contract —
  // an unset status now honestly shows "Not set".
  const [availabilityStatus, setAvailabilityStatus] = useState(profile?.availability_status || "")
  const isDoctor = profile?.role === "doctor"

  // Notification preferences (QA Round 3, profile M5): the column has
  // existed since the first schema with a seeded default, but no UI
  // could change it and no sender honoured it. These toggles write it;
  // the appointments notify route checks the email flag before sending.
  const initialPrefs = (profile?.notification_prefs as { in_app?: boolean; email?: boolean; sms?: boolean } | null) || {}
  const [notifPrefs, setNotifPrefs] = useState({
    in_app: initialPrefs.in_app !== false,
    email: initialPrefs.email !== false,
    sms: initialPrefs.sms === true,
  })

  // A doctor's license number and experience live on the doctors row
  // (QA Round 3, profile M3) — shown read-only here so errors are at
  // least visible; corrections go through an administrator.
  const [doctorRecord, setDoctorRecord] = useState<{ license_number?: string | null; experience?: number | null } | null>(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null)

  const supabase = createClient()

  useEffect(() => {
    if (!isDoctor) return
    supabase
      .from("doctors")
      .select("license_number, experience")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setDoctorRecord(data)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDoctor, user.id])

  // The avatar persists the moment the upload finishes (QA Round 3,
  // profile H4) — previously it only reached the database if the user
  // also clicked Save, so uploaded photos were routinely lost.
  const handleAvatarUpload = async (url: string) => {
    setAvatarUrl(url)
    const { data, error } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", user.id)
      .select("id")
    if (error || !data || data.length === 0) {
      console.error("Avatar save failed:", error)
      setError("Your photo was uploaded but could not be saved to your profile. Please try again.")
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      // Validation (QA Round 3, profile M2): this form previously saved
      // an empty name, any string as a phone number, and a negative or
      // NaN fee without a word.
      if (fullName.trim().length < 2) {
        setError("Please enter your full name.")
        return
      }
      if (phone.trim() && !/^[+\d][\d\s()-]{6,19}$/.test(phone.trim())) {
        setError("That phone number doesn't look complete. Use the format +92 300 1234567.")
        return
      }
      if (consultationFee !== "" && (!Number.isFinite(Number(consultationFee)) || Number(consultationFee) < 0)) {
        setError("The consultation fee must be a number of 0 or more.")
        return
      }

      // Changed-fields-only payload (QA Round 3, profile M1): the old
      // save rewrote every field from a mount-time snapshot, silently
      // reverting concurrent admin edits to fields the user never
      // touched. Doctor-only keys are omitted entirely for non-doctors.
      // hospital_id is deliberately never written here: assignment is
      // admin-only (QA Round 2, cluster 12).
      const payload: Record<string, unknown> = {}
      if (fullName.trim() !== (profile?.full_name || "")) payload.full_name = fullName.trim()
      if (department.trim() !== (profile?.department || "")) payload.department = department.trim()
      if (phone.trim() !== (profile?.contact_number || "")) payload.contact_number = phone.trim()
      if (bio.trim() !== (profile?.bio || "")) payload.bio = bio.trim()
      if (JSON.stringify(notifPrefs) !== JSON.stringify({ in_app: initialPrefs.in_app !== false, email: initialPrefs.email !== false, sms: initialPrefs.sms === true })) {
        payload.notification_prefs = notifPrefs
      }
      if (isDoctor) {
        if (specialty !== (profile?.specialty || "")) payload.specialty = specialty
        if (availabilityStatus && availabilityStatus !== (profile?.availability_status || "")) {
          payload.availability_status = availabilityStatus
          payload.available = availabilityStatus === "available"
        }
        const feeValue = consultationFee === "" ? null : Number(consultationFee)
        if (feeValue !== (profile?.consultation_fee ?? null)) payload.consultation_fee = feeValue
        const services = servicesString.split(',').map((item: string) => item.trim()).filter(Boolean)
        if (JSON.stringify(services) !== JSON.stringify(profile?.services || [])) payload.services = services
      }

      if (Object.keys(payload).length > 0) {
        // Verified write (QA Round 3, profile H1): a zero-row update
        // returns no error, so success requires a row back.
        const { data, error } = await supabase
          .from("profiles")
          .update(payload)
          .eq("id", user.id)
          .select("id")
        if (error) throw error
        if (!data || data.length === 0) {
          setError("Your profile could not be saved — no matching record was found. Please reload the page and try again.")
          return
        }
      }

      // Keep the doctors row's specialization in step with the profile
      // (QA Round 3, profile M3): admins verify doctors against
      // doctors.specialization while the directory reads
      // profiles.specialty, so the two must not diverge.
      if (isDoctor && typeof payload.specialty === "string") {
        const { error: doctorError } = await supabase
          .from("doctors")
          .update({ specialization: payload.specialty })
          .eq("user_id", user.id)
        if (doctorError) {
          console.error("Doctor specialization sync failed:", doctorError)
          setError("Your profile was saved, but your specialty could not be synced to your doctor record. Please try again.")
          return
        }
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      console.error("Profile save failed:", e)
      setError("Unable to save your profile. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); void handleSave() }}>
      {/* Profile preview header */}
      <div className="flex items-center gap-5 pb-6 border-b">
        <AvatarUploader uid={user.id} url={avatarUrl} name={fullName} onUpload={handleAvatarUpload} />
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
            <p className="text-xs text-muted-foreground">Your email can&apos;t be changed here — ask an administrator if it needs updating.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">System Role</Label>
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              {profile?.role ? roleLabel(profile.role) : "Unassigned"}
              <span className="text-xs text-muted-foreground ml-1">(managed by admin)</span>
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
              <span className="text-xs text-muted-foreground ml-1">(assigned by admin)</span>
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
            {doctorRecord && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">License Number</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
                    {doctorRecord.license_number || "Not recorded"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Years of Experience</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
                    {doctorRecord.experience ?? "Not recorded"}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  These come from your approved application and can&apos;t be edited here — contact an administrator if either is wrong.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="availabilityStatus">Availability</Label>
              <Select value={availabilityStatus} onValueChange={setAvailabilityStatus}>
                <SelectTrigger id="availabilityStatus">
                  <SelectValue placeholder="Not set" />
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
                min={0}
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
                className="min-h-[120px] w-full rounded-xl border border-input bg-background px-3 py-2 text-base sm:text-sm shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Describe your specialties, clinical philosophy, and experience."
              />
            </div>
          </div>
        </div>
        )}
      </div>



      {/* Notification preferences */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Notifications</h3>
        <div className="space-y-2">
          {([
            { key: "in_app", label: "In-app notifications", hint: "Alerts inside WhyRisk, such as the header bell." },
            { key: "email", label: "Email notifications", hint: "Appointment emails sent to your address." },
            { key: "sms", label: "SMS notifications", hint: "Text messages, where the clinic has them enabled." },
          ] as const).map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
              <div>
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.hint}</p>
              </div>
              <button
                type="button"
                aria-pressed={notifPrefs[row.key]}
                onClick={() => setNotifPrefs((p) => ({ ...p, [row.key]: !p[row.key] }))}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${notifPrefs[row.key] ? "border-[#1E7A46]/30 bg-[#E2F0E6] text-[#1E7A46]" : "border-border bg-muted/40 text-muted-foreground"}`}
              >
                {notifPrefs[row.key] ? "On" : "Off"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      {error && (
        <div role="alert" className="p-3 bg-destructive/10 text-destructive-text text-sm rounded-lg border border-destructive/20">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-[#1E7A46]">
            <CheckCircle2 className="h-4 w-4" /> Profile updated!
          </span>
        )}
      </div>
    </form>
  )
}
