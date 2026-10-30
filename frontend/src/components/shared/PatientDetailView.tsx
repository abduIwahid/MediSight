"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { PatientRiskCard } from "@/components/shared/PatientRiskCard"
import { DataTable } from "@/components/shared/DataTable"
import { RunPredictionButton } from "@/components/shared/RunPredictionButton"
import { RiskTrendChart } from "@/components/shared/RiskTrendChart"
import { EmptyState } from "@/components/shared/EmptyState"
import Link from "next/link"
import { ArrowLeft, User, Calendar, Activity, FlaskConical, Stethoscope, Heart, Pencil, Trash2, TrendingUp, ClipboardList, Plus } from "lucide-react"
import { fmtDate as fmtAppDate } from "@/lib/dates"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { motion, AnimatePresence, type Variants } from "framer-motion"
import type { LabResultRow, PatientDemographics, PatientRow, PredictionRow, VitalRow } from "@/lib/types"

// Format snake_case → Title Case, with medical abbreviations
function fmtLabel(str: string): string {
  if (!str) return "—"
  const abbr: Record<string, string> = {
    bmi: "BMI", bp: "BP", hdl: "HDL", ldl: "LDL",
    cholesterol: "Cholesterol", systolic: "Systolic BP", diastolic: "Diastolic BP",
  }
  return str.split(/[_\s]+/).map(w => abbr[w.toLowerCase()] || w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

function fmtDate(iso?: string | null): string {
  // One convention app-wide: Asia/Karachi, via lib/dates.
  return fmtAppDate(iso)
}

function getPatientName(patient: PatientRow): string {
  const d = patient.demographics
  if (!d) return "Unknown Patient"
  if (d.full_name) return d.full_name
  if (d.name) return d.name
  const first = d.first_name || d.firstName || ""
  const last = d.last_name || d.lastName || ""
  return `${first} ${last}`.trim() || "Unknown Patient"
}

interface PatientDetailViewProps {
  patient: PatientRow
  latestPrediction: PredictionRow | null
  isAdmin?: boolean
  /** Doctors (and admins) may edit demographics; delete stays
   *  admin-only (QA Round 3, patients-crud M7). */
  canEdit?: boolean
  /** Roles whose RLS policies allow writing vitals (doctor,
   *  hospital_admin, super_admin) — gates the add/edit vital form so
   *  nobody is offered a control that can only fail. */
  canAddVitals?: boolean
}

/** The vital types this chart records, with their fixed unit and the
 *  plausible range a value is validated against before it is written.
 *  The unit is never typed by hand — it follows the type, so a heart
 *  rate can never land in the record labelled mmHg. Ranges are wide
 *  clinical plausibility bounds, not normal ranges: they exist to
 *  catch typos (a heart rate of 900), not to judge the patient. */
const VITAL_TYPES: { type: string; unit: string; min: number; max: number }[] = [
  { type: "Blood Pressure Systolic", unit: "mmHg", min: 40, max: 300 },
  { type: "Blood Pressure Diastolic", unit: "mmHg", min: 20, max: 200 },
  { type: "Heart Rate", unit: "bpm", min: 20, max: 250 },
  { type: "Respiratory Rate", unit: "/min", min: 4, max: 60 },
  { type: "Temperature", unit: "°F", min: 85, max: 110 },
  { type: "SpO2", unit: "%", min: 50, max: 100 },
  { type: "Blood Glucose", unit: "mg/dL", min: 20, max: 600 },
  { type: "Weight", unit: "kg", min: 1, max: 500 },
  { type: "BMI", unit: "kg/m²", min: 8, max: 80 },
]

export function PatientDetailView({ patient, latestPrediction, isAdmin = false, canEdit, canAddVitals = false }: PatientDetailViewProps) {
  const showEdit = canEdit ?? isAdmin
  const router = useRouter()
  const supabase = createClient()

  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  // A prediction run from this page hands its row back via onResult;
  // it becomes the current assessment immediately. The page never does
  // a full router.refresh() after a run (deliberate, Batch 4), so
  // without this the server-rendered card kept presenting the PREVIOUS
  // score as "Current Assessment" next to the new inline result
  // (QA Round 2, cluster 6).
  const [freshPrediction, setFreshPrediction] = useState<PredictionRow | null>(null)
  const currentPrediction = freshPrediction ?? latestPrediction
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [newLab, setNewLab] = useState({
    test_name: "",
    value: "",
    unit: "",
    recorded_at: new Date().toISOString().slice(0, 10),
  })

  // Add/edit vitals (features round, 2026-10-30). Rows written here
  // join the displayed list immediately via localVitals overrides, so
  // the clinician sees the value they just saved without waiting on a
  // server re-render; router.refresh() still runs to reconcile.
  const [vitalFormOpen, setVitalFormOpen] = useState(false)
  const [editingVitalId, setEditingVitalId] = useState<string | null>(null)
  const [newVital, setNewVital] = useState({
    type: VITAL_TYPES[0].type,
    value: "",
    recorded_at: new Date().toISOString().slice(0, 10),
  })
  const [vitalSaving, setVitalSaving] = useState(false)
  const [vitalMessage, setVitalMessage] = useState<string | null>(null)
  const [vitalError, setVitalError] = useState<string | null>(null)
  const [localVitals, setLocalVitals] = useState<Record<string, VitalRow>>({})

  const handleSaveVital = async () => {
    const spec = VITAL_TYPES.find((v) => v.type === newVital.type)
    const value = Number(newVital.value)
    // A legacy vital whose type predates VITAL_TYPES can still be
    // edited (value/date only) — it just has no range to check against.
    if (!spec && !editingVitalId) {
      setVitalError("Please choose the vital type from the list.")
      return
    }
    if (newVital.value.trim() === "" || !Number.isFinite(value)) {
      setVitalError(`Please enter a numeric value for ${fmtLabel(newVital.type)}.`)
      return
    }
    if (spec && (value < spec.min || value > spec.max)) {
      setVitalError(`${spec.type} must be between ${spec.min} and ${spec.max} ${spec.unit} — please check the value.`)
      return
    }
    if (!newVital.recorded_at || newVital.recorded_at > new Date().toISOString().slice(0, 10)) {
      setVitalError("Please choose the date the vital was recorded (today or earlier).")
      return
    }

    setVitalSaving(true)
    setVitalError(null)
    setVitalMessage(null)

    const recordedAt = new Date(`${newVital.recorded_at}T12:00:00.000Z`).toISOString()
    if (editingVitalId) {
      // .select() verification, same as the delete flow: an RLS-refused
      // update returns no error and zero rows, which must not read as
      // success.
      const { data: updated, error } = await supabase
        .from("vitals")
        .update({ value, recorded_at: recordedAt })
        .eq("id", editingVitalId)
        .select("id, patient_id, type, value, unit, recorded_at")
      if (error || !updated || updated.length === 0) {
        if (error) console.error("Vital update failed:", error)
        setVitalError("That vital could not be updated. You may not have permission to change it.")
        setVitalSaving(false)
        return
      }
      const row = updated[0] as VitalRow
      setLocalVitals((prev) => ({ ...prev, [row.id as string]: row }))
      setVitalMessage("Vital updated.")
    } else {
      // Inserts always carry a listed type (the early return above
      // guarantees it); the check just makes that explicit.
      if (!spec) {
        setVitalError("Please choose the vital type from the list.")
        setVitalSaving(false)
        return
      }
      const { data: inserted, error } = await supabase
        .from("vitals")
        .insert({
          patient_id: patient.id,
          type: spec.type,
          value,
          unit: spec.unit,
          recorded_at: recordedAt,
        })
        .select("id, patient_id, type, value, unit, recorded_at")
      if (error || !inserted || inserted.length === 0) {
        if (error) console.error("Vital insert failed:", error)
        setVitalError("That vital could not be saved. You may not have permission to add vitals for this patient.")
        setVitalSaving(false)
        return
      }
      const row = inserted[0] as VitalRow
      setLocalVitals((prev) => ({ ...prev, [row.id as string]: row }))
      setVitalMessage("Vital recorded.")
    }

    setEditingVitalId(null)
    setNewVital({ type: VITAL_TYPES[0].type, value: "", recorded_at: new Date().toISOString().slice(0, 10) })
    setVitalSaving(false)
    router.refresh()
  }

  // Book follow-up (features round, 2026-10-30): creates a Confirmed
  // appointment the patient sees in their portal. Only possible when
  // the record is linked to a portal account (migration 22); doctors
  // book for their assigned patients (migration 23), admins fall back
  // to the patient's first assigned doctor.
  const linkedUserId = typeof patient.user_id === "string" ? patient.user_id : null
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUp, setFollowUp] = useState(() => {
    const t = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    t.setMinutes(0, 0, 0)
    const local = new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    return { when: local, reason: "Follow-up visit" }
  })
  const [followUpSaving, setFollowUpSaving] = useState(false)
  const [followUpError, setFollowUpError] = useState<string | null>(null)
  const [followUpDone, setFollowUpDone] = useState(false)

  const handleBookFollowUp = async () => {
    if (!linkedUserId) return
    const when = new Date(followUp.when)
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setFollowUpError("Please choose a date and time in the future.")
      return
    }
    setFollowUpSaving(true)
    setFollowUpError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setFollowUpError("Your session has ended. Please sign in again.")
      setFollowUpSaving(false)
      return
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    let doctorId: string | null = null
    if (profile?.role === "doctor") {
      doctorId = user.id
    } else {
      const { data: assignment } = await supabase
        .from("doctor_patient_assignments")
        .select("doctor_id")
        .eq("patient_id", patient.id)
        .limit(1)
        .maybeSingle()
      doctorId = assignment?.doctor_id ?? null
    }
    if (!doctorId) {
      setFollowUpError("No doctor is assigned to this patient yet — assign a doctor before booking a follow-up.")
      setFollowUpSaving(false)
      return
    }

    const { data: inserted, error } = await supabase
      .from("appointments")
      .insert({
        patient_id: linkedUserId,
        doctor_id: doctorId,
        scheduled_at: when.toISOString(),
        status: "Confirmed",
        reason: followUp.reason.trim() || "Follow-up visit",
      })
      .select("id")
    if (error || !inserted || inserted.length === 0) {
      if (error) console.error("Follow-up booking failed:", error)
      setFollowUpError("That follow-up could not be booked. Doctors can book follow-ups for patients assigned to them.")
      setFollowUpSaving(false)
      return
    }
    setFollowUpDone(true)
    setFollowUpSaving(false)
  }

  const startEditVital = (v: VitalRow) => {
    if (!v.id) return
    setEditingVitalId(v.id)
    setNewVital({
      type: v.type,
      value: String(v.value ?? ""),
      recorded_at: (v.recorded_at || new Date().toISOString()).slice(0, 10),
    })
    setVitalError(null)
    setVitalMessage(null)
    setVitalFormOpen(true)
  }

  // Prefill goes through the same name resolution the header uses
  // (QA Round 3, patients-crud M3): a record that stores only
  // full_name used to open this form BLANK, and saving it overwrote a
  // good name with the merge of two empty fields.
  const prefillFrom = (row: PatientRow) => {
    const d = row.demographics || {}
    let first = d.first_name || d.firstName || ""
    let last = d.last_name || d.lastName || ""
    if (!first && !last) {
      const full = (d.full_name || d.name || "").trim()
      if (full) {
        const parts = full.split(/\s+/)
        first = parts[0] || ""
        last = parts.slice(1).join(" ")
      }
    }
    const dobRaw = d.birth_date || d.dob
    const derivedAge = dobRaw
      ? Math.floor((Date.now() - new Date(dobRaw).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null
    return {
      first_name: first,
      last_name: last,
      age: String(d.age ?? derivedAge ?? ""),
      gender: d.gender || "",
    }
  }
  const [demographics, setDemographics] = useState(() => prefillFrom(patient))

  useEffect(() => {
    setDemographics(prefillFrom(patient))
  }, [patient])

  const name = getPatientName(patient)
  const d = patient.demographics || {}
  const dobRaw = d.birth_date || d.dob
  const age = (
    dobRaw
      ? Math.floor((Date.now() - new Date(dobRaw).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null
  ) ?? d.age ?? null
  const gender = d.gender ? d.gender.charAt(0).toUpperCase() + d.gender.slice(1).toLowerCase() : "—"
  const dob = dobRaw ? fmtDate(dobRaw) : "—"

  const handleSaveUpdates = async () => {
    setSaving(true)
    setErrorMessage(null)
    setStatusMessage(null)

    // Validation (QA Round 3, patients-crud L3): names are trimmed,
    // gender must be one of the offered values, age a plausible number.
    const firstName = demographics.first_name.trim()
    const lastName = demographics.last_name.trim()
    if (!firstName && !lastName) {
      setErrorMessage('Please enter the patient\'s name.')
      setSaving(false)
      return
    }
    if (demographics.gender && !['Male', 'Female', 'Other'].includes(demographics.gender)) {
      setErrorMessage('Please choose the patient\'s gender from the list.')
      setSaving(false)
      return
    }
    const ageValue = demographics.age === "" ? null : Number(demographics.age)
    if (ageValue !== null && (!Number.isFinite(ageValue) || ageValue < 0 || ageValue > 120)) {
      setErrorMessage('Please enter an age between 0 and 120, or leave it blank.')
      setSaving(false)
      return
    }

    // Re-read the CURRENT demographics before writing (QA Round 3,
    // data-integrity DI3-05): the merge base used to be the page-load
    // snapshot, so an intake risk factor recorded after this page
    // loaded was silently reverted by an unrelated name edit.
    const { data: freshRow, error: readError } = await supabase
      .from('patients')
      .select('demographics')
      .eq('id', patient.id)
      .single()
    if (readError || !freshRow) {
      console.error("Patient re-read failed:", readError)
      setErrorMessage('Unable to save patient updates. Please try again.')
      setSaving(false)
      return
    }

    // Part 1 — demographics, verified (DI3-03): a zero-row update is a
    // failure, and on failure the lab insert is NOT attempted and edit
    // mode stays open — the old flow reported total success after a
    // demographics write that had matched nothing.
    const merged: PatientDemographics = {
      ...(freshRow.demographics as PatientDemographics),
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(),
      gender: demographics.gender,
      age: ageValue,
    }
    const { data: updatedRows, error: demoError } = await supabase
      .from('patients')
      .update({ demographics: merged })
      .eq('id', patient.id)
      .select('id')
    if (demoError || !updatedRows || updatedRows.length === 0) {
      if (demoError) console.error("Patient demographics update failed:", demoError)
      setErrorMessage('The demographic changes could not be saved. Nothing was changed — please try again.')
      setSaving(false)
      return
    }

    // Part 2 — the optional lab result, reported separately (M4): if
    // it fails, demographics stay saved and the form stays open with
    // the lab fields intact so the entry can be retried.
    if (newLab.test_name.trim() && newLab.value.trim()) {
      const { error: labError } = await supabase.from('lab_results').insert({
        patient_id: patient.id,
        test_name: newLab.test_name.trim(),
        value: newLab.value,
        unit: newLab.unit || "",
        recorded_at: newLab.recorded_at,
      })
      if (labError) {
        console.error("Lab insert failed:", labError)
        setStatusMessage('Demographics saved. The lab result could not be added — check it and save again.')
        setSaving(false)
        router.refresh()
        return
      }
    }

    setStatusMessage('Patient record updated successfully.')
    setNewLab({ test_name: "", value: "", unit: "", recorded_at: new Date().toISOString().slice(0, 10) })
    setEditMode(false)
    setSaving(false)
    router.refresh()
  }

  const [pendingDelete, setPendingDelete] = useState(false)

  const handleDeletePatient = async () => {
    setPendingDelete(false)
    setDeleteLoading(true)
    setErrorMessage(null)
    setStatusMessage(null)

    // .select() verification: an RLS-refused delete returns no error and
    // zero rows — without the row check it would look like success and
    // navigate away from a record that still exists.
    const { data: deleted, error } = await supabase.from('patients').delete().eq('id', patient.id).select('id')
    if (error || !deleted || deleted.length === 0) {
      if (error) console.error("Patient delete failed:", error)
      setErrorMessage('This patient record could not be deleted. You may not have permission, or the record is linked to other data.')
      setDeleteLoading(false)
      return
    }

    router.push('/patients')
  }

  const vitalsColumns = [
    { header: "Type", cell: (v: VitalRow) => <span className="font-medium">{fmtLabel(v.type)}</span> },
    { header: "Value", cell: (v: VitalRow) => `${v.value} ${v.unit || ""}`.trim() },
    { header: "Date", cell: (v: VitalRow) => fmtDate(v.recorded_at) },
    ...(canAddVitals
      ? [{
          header: "",
          cell: (v: VitalRow) => (
            <button
              type="button"
              onClick={() => startEditVital(v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              aria-label={`Edit ${v.type} recorded ${fmtDate(v.recorded_at)}`}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          ),
        }]
      : []),
  ]

  const labsColumns = [
    { header: "Test", cell: (l: LabResultRow) => <span className="font-medium">{fmtLabel(l.test_name)}</span> },
    { header: "Value", cell: (l: LabResultRow) => `${l.value} ${l.unit || ""}`.trim() },
    { header: "Date", cell: (l: LabResultRow) => fmtDate(l.recorded_at) }
  ]

  const allPredictions = freshPrediction && !(patient.predictions || []).some((p) => p.id === freshPrediction.id)
    ? [freshPrediction, ...(patient.predictions || [])]
    : (patient.predictions || [])
  const sortedPreds = [...allPredictions].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // Vitals and labs read newest-first (the record must not depend on
  // the order the query happened to return), capped at the latest 8 —
  // and the cap is labelled where it applies.
  // Locally saved vitals override/extend the server rows by id, so a
  // just-recorded vital is visible in place even before the refresh
  // lands (and an edited row shows its new value, not the stale one).
  const mergedVitals = (() => {
    const byId = new Map<string, VitalRow>()
    const idless: VitalRow[] = []
    for (const v of patient.vitals || []) {
      if (v.id) byId.set(v.id, v)
      else idless.push(v)
    }
    for (const [id, v] of Object.entries(localVitals)) byId.set(id, v)
    return [...idless, ...byId.values()]
  })()
  const sortedVitals = [...mergedVitals].sort((a, b) =>
    new Date(b.recorded_at || 0).getTime() - new Date(a.recorded_at || 0).getTime()
  )
  const sortedLabs = [...(patient.lab_results || [])].sort((a, b) =>
    new Date(b.recorded_at || 0).getTime() - new Date(a.recorded_at || 0).getTime()
  )
  const diagnoses = patient.diagnoses || []

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  }

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-7xl mx-auto pb-8"
    >
      <motion.div variants={itemVariants} className="flex flex-col gap-6 lg:gap-0 lg:flex-row lg:items-start lg:justify-between bg-card p-6 rounded-xl border shadow-card">
        <div className="flex items-start gap-5">
          <Link href="/patients">
            <button className="mt-1 h-10 w-10 rounded-full border border-border/50 bg-muted/30 flex items-center justify-center hover:bg-muted hover:scale-105 transition-all">
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl bg-secondary border border-border flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-bold text-primary">
                  {name !== "Unknown Patient" ? name.charAt(0).toUpperCase() : "?"}
                </span>
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground mt-1.5">
                  <span className="font-mono text-xs bg-muted/80 px-2.5 py-1 rounded-md border text-foreground font-medium">{patient.mrn}</span>
                  {age != null && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Age {age}</span>}
                  {gender !== "—" && <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {gender}</span>}
                  {dob !== "—" && <span>DOB: {dob}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {(showEdit || isAdmin) && (
          <div className="flex flex-wrap items-center gap-3">
            {showEdit && (
            <Button variant={editMode ? "default" : "outline"} className="rounded-xl transition-all hover:shadow-md" onClick={() => setEditMode((open) => !open)}>
              <Pencil className="mr-2 h-4 w-4" /> {editMode ? 'Cancel Edit' : 'Update Profile'}
            </Button>
            )}
            {isAdmin && (
            <Button variant="destructive" className="rounded-xl transition-all hover:shadow-md" onClick={() => { setErrorMessage(null); setStatusMessage(null); setPendingDelete(true) }} disabled={deleteLoading}>
              <Trash2 className="mr-2 h-4 w-4" /> {deleteLoading ? 'Deleting…' : 'Delete Record'}
            </Button>
            )}
          </div>
        )}
      </motion.div>

      {pendingDelete && (
        <div role="alertdialog" aria-label="Confirm patient deletion" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <p className="text-destructive">
            Delete <strong>{name}</strong>&apos;s record? This also removes their predictions, vitals, lab results, diagnoses, appointments and alerts. This cannot be undone.
          </p>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              autoFocus
              onClick={handleDeletePatient}
              className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90"
            >
              Delete record
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(false)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!editMode && errorMessage && (
        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive-text">
          {errorMessage}
        </div>
      )}

      <AnimatePresence>
        {editMode && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-card border rounded-xl p-6 shadow-md space-y-5 my-4 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary rounded-l-2xl"></div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">Update Patient Record</h2>
                  <p className="text-sm text-muted-foreground mt-1">Edit patient demographics and register new laboratory results. Changes are not saved until you click Save Changes.</p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    className="h-11 rounded-xl"
                    value={demographics.first_name}
                    onChange={(e) => setDemographics({ ...demographics, first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    className="h-11 rounded-xl"
                    value={demographics.last_name}
                    onChange={(e) => setDemographics({ ...demographics, last_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    type="number"
                    className="h-11 rounded-xl"
                    value={demographics.age}
                    onChange={(e) => setDemographics({ ...demographics, age: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select value={demographics.gender} onValueChange={(value) => setDemographics({ ...demographics, gender: value })}>
                    <SelectTrigger id="gender" className="h-11 rounded-xl">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-border/50">
                <h3 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                  <FlaskConical className="h-4 w-4" /> Add Laboratory Result
                </h3>
                <div className="grid gap-5 sm:grid-cols-4 items-end">
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="labTest">Test Name</Label>
                    <Input
                      id="labTest"
                      className="h-11 rounded-xl"
                      value={newLab.test_name}
                      onChange={(e) => setNewLab({ ...newLab, test_name: e.target.value })}
                      placeholder="e.g. HbA1c"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="labValue">Result Value</Label>
                    <Input
                      id="labValue"
                      className="h-11 rounded-xl"
                      value={newLab.value}
                      onChange={(e) => setNewLab({ ...newLab, value: e.target.value })}
                      placeholder="e.g. 6.8"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="labUnit">Unit</Label>
                    <Input
                      id="labUnit"
                      className="h-11 rounded-xl"
                      value={newLab.unit}
                      onChange={(e) => setNewLab({ ...newLab, unit: e.target.value })}
                      placeholder="e.g. %"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="labDate">Date</Label>
                    <Input
                      id="labDate"
                      type="date"
                      className="h-11 rounded-xl"
                      value={newLab.recorded_at}
                      onChange={(e) => setNewLab({ ...newLab, recorded_at: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {(statusMessage || errorMessage) && (
                <motion.div
                  role={errorMessage ? "alert" : "status"}
                  initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  className={`rounded-xl p-4 text-sm font-medium flex items-center gap-2 ${errorMessage ? 'bg-destructive/10 text-destructive-text border border-destructive/20' : 'bg-[#E2F0E6] text-[#1E7A46] border border-[#1E7A46]/25'}`}
                >
                  {errorMessage || statusMessage}
                </motion.div>
              )}

              <div className="flex flex-wrap gap-3 pt-4 border-t border-border/50">
                <Button onClick={handleSaveUpdates} disabled={saving} className="rounded-xl h-11 px-6 shadow-md transition-all hover:shadow-lg">
                  {saving ? 'Saving changes…' : 'Save Changes'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Discard means discard (QA Round 3, patients-crud
                    // L2): the typed values used to survive closing and
                    // silently reappear — and re-save — next time.
                    setDemographics(prefillFrom(patient))
                    setNewLab({ test_name: "", value: "", unit: "", recorded_at: new Date().toISOString().slice(0, 10) })
                    setErrorMessage(null)
                    setStatusMessage(null)
                    setEditMode(false)
                  }}
                  className="rounded-xl h-11 px-6"
                >
                  Discard
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Gender", icon: User, value: gender },
          { label: "Age", icon: Calendar, value: age != null ? `${age} yrs` : "—" },
          { label: "Vitals Tracked", icon: Activity, value: `${sortedVitals.length} records` },
          { label: "Lab Results", icon: FlaskConical, value: `${patient.lab_results?.length || 0} results` },
        ].map((stat, i) => (
          <div key={i} className="group bg-card border rounded-xl p-5 shadow-card hover:shadow-md transition-all duration-300 flex flex-col items-start gap-2 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-150 transition-transform duration-500">
              <stat.icon className="h-24 w-24" />
            </div>
            <div className="p-2 rounded-xl bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
              <stat.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</p>
              <p className="font-bold text-lg mt-0.5">{stat.value}</p>
            </div>
          </div>
        ))}
      </motion.div>

      <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          {currentPrediction ? (
            <motion.div whileHover={{ scale: 1.01 }} className="transition-all">
              <PatientRiskCard
                disease={currentPrediction.disease ?? "Diabetes"}
                probability={currentPrediction.probability ?? null}
                confidence={currentPrediction.confidence ?? null}
                severity={currentPrediction.severity ?? "Unknown"}
                patientId={patient.id}
                predictionId={currentPrediction.id ?? ""}
              />
            </motion.div>
          ) : (
            <div className="bg-card border rounded-xl p-8 shadow-card flex flex-col items-center text-center space-y-5">
              <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center">
                <Stethoscope className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-foreground text-base font-bold">No Risk Assessment</p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-[250px]">Execute the AI predictive model to generate a baseline risk profile.</p>
              </div>
              <RunPredictionButton patient={patient} onResult={setFreshPrediction} />
            </div>
          )}

          {currentPrediction && (
            <div className="bg-card border rounded-xl p-5 shadow-card">
              <h3 className="text-xs font-bold text-primary uppercase tracking-widest mb-4">Run Updated Assessment</h3>
              <RunPredictionButton patient={patient} onResult={setFreshPrediction} />
            </div>
          )}

          <div className="bg-card border rounded-xl p-5 shadow-card">
            <h3 className="text-xs font-bold text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Follow-up
            </h3>
            {!linkedUserId ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                This record is not linked to a patient portal account yet, so a follow-up cannot be booked
                from here. Once the record is linked, booking opens and the patient sees the appointment
                in their portal.
              </p>
            ) : followUpDone ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-[#1E7A46]">Follow-up booked. The patient can see it in their portal.</p>
                <Link href="/appointments" className="text-sm font-medium text-primary hover:underline">
                  View in Appointments
                </Link>
              </div>
            ) : !followUpOpen ? (
              <Button onClick={() => setFollowUpOpen(true)} className="rounded-xl h-11 px-5 w-full">
                Book follow-up
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="followUpWhen">Date and time</Label>
                  <Input
                    id="followUpWhen"
                    type="datetime-local"
                    className="h-11 rounded-xl"
                    value={followUp.when}
                    onChange={(e) => setFollowUp({ ...followUp, when: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="followUpReason">Reason</Label>
                  <Input
                    id="followUpReason"
                    className="h-11 rounded-xl"
                    value={followUp.reason}
                    onChange={(e) => setFollowUp({ ...followUp, reason: e.target.value })}
                    placeholder="Follow-up visit"
                  />
                </div>
                {followUpError && (
                  <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive-text">
                    {followUpError}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={handleBookFollowUp} disabled={followUpSaving} className="rounded-xl h-11 px-5 flex-1">
                    {followUpSaving ? "Booking…" : "Confirm booking"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setFollowUpOpen(false); setFollowUpError(null) }}
                    className="rounded-xl h-11 px-4"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {sortedPreds.length >= 1 && (
            <div className="bg-card border rounded-xl p-5 shadow-card">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Risk Trend
              </h3>
              {sortedPreds.length >= 2 ? (
                <RiskTrendChart predictions={sortedPreds} />
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="Not enough assessments for a trend"
                  description="A trend needs at least two assessments. Run an updated assessment to start tracking how this patient's risk changes over time."
                  className="border-none bg-transparent px-2 py-6"
                />
              )}
            </div>
          )}

          {sortedPreds.length > 1 && (
            <div className="bg-card border rounded-xl p-5 shadow-card">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" /> Prediction History
              </h3>
              <div className="space-y-3">
                {sortedPreds.slice(0, 5).map((pred) => (
                  <Link
                    key={pred.id}
                    href={`/patients/${patient.id}/predictions/${pred.id}`}
                    className="flex items-center justify-between text-sm p-3 rounded-xl border bg-background hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-muted-foreground font-medium">{fmtDate(pred.created_at)}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">{pred.probability != null ? `${(pred.probability * 100).toFixed(0)}%` : "Not recorded"}</span>
                      <RiskBadge severity={pred.severity ?? "Unknown"} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border rounded-xl p-6 shadow-card overflow-hidden flex flex-col">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold flex items-center gap-3 tracking-tight">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                Recent Vitals
              </h2>
              {canAddVitals && !vitalFormOpen && (
                <Button
                  onClick={() => {
                    setEditingVitalId(null)
                    setNewVital({ type: VITAL_TYPES[0].type, value: "", recorded_at: new Date().toISOString().slice(0, 10) })
                    setVitalError(null)
                    setVitalMessage(null)
                    setVitalFormOpen(true)
                  }}
                  className="rounded-xl h-10 px-4 shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Add Vital
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-x-auto custom-scrollbar -mx-2 px-2 pb-2">
              <div className="min-w-0 sm:min-w-[400px]">
                {sortedVitals.length > 0 ? (
                  <>
                    <DataTable columns={vitalsColumns} data={sortedVitals.slice(0, 8)} />
                    {sortedVitals.length > 8 && (
                      <p className="mt-2 text-xs text-muted-foreground">Latest 8 of {sortedVitals.length} recorded vitals.</p>
                    )}
                  </>
                ) : (
                  <EmptyState
                    icon={Activity}
                    title="No vitals recorded"
                    description="Vitals recorded for this patient will appear here, newest first."
                    className="border-none bg-transparent px-2 py-8"
                  />
                )}
              </div>
            </div>

            {canAddVitals && vitalFormOpen && (
              <div className="mt-2 space-y-4 border-t border-border/50 pt-5">
                <h3 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                  <Activity className="h-4 w-4" /> {editingVitalId ? "Edit Vital" : "Add Vital"}
                </h3>
                <div className="grid gap-5 sm:grid-cols-4 items-end">
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="vitalType">Type</Label>
                    <Select
                      value={newVital.type}
                      onValueChange={(value) => setNewVital({ ...newVital, type: value })}
                      disabled={Boolean(editingVitalId)}
                    >
                      <SelectTrigger id="vitalType" className="h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VITAL_TYPES.map((v) => (
                          <SelectItem key={v.type} value={v.type}>{v.type}</SelectItem>
                        ))}
                        {editingVitalId && !VITAL_TYPES.some((v) => v.type === newVital.type) && (
                          <SelectItem value={newVital.type}>{fmtLabel(newVital.type)}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="vitalValue">
                      Value ({VITAL_TYPES.find((v) => v.type === newVital.type)?.unit || ""})
                    </Label>
                    <Input
                      id="vitalValue"
                      type="number"
                      step="any"
                      inputMode="decimal"
                      className="h-11 rounded-xl"
                      value={newVital.value}
                      onChange={(e) => setNewVital({ ...newVital, value: e.target.value })}
                      placeholder="e.g. 72"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-1">
                    <Label htmlFor="vitalDate">Date Recorded</Label>
                    <Input
                      id="vitalDate"
                      type="date"
                      className="h-11 rounded-xl"
                      value={newVital.recorded_at}
                      onChange={(e) => setNewVital({ ...newVital, recorded_at: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2 sm:col-span-1">
                    <Button onClick={handleSaveVital} disabled={vitalSaving} className="rounded-xl h-11 px-5 flex-1">
                      {vitalSaving ? "Saving…" : editingVitalId ? "Update Vital" : "Save Vital"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setVitalFormOpen(false)
                        setEditingVitalId(null)
                        setVitalError(null)
                      }}
                      className="rounded-xl h-11 px-4"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
                {editingVitalId && (
                  <p className="text-xs text-muted-foreground">
                    The type and unit of an existing vital stay fixed — record a new vital to correct those.
                  </p>
                )}
              </div>
            )}

            {(vitalMessage || vitalError) && (
              <div
                role={vitalError ? "alert" : "status"}
                className={`mt-4 rounded-xl p-4 text-sm font-medium ${vitalError ? "bg-destructive/10 text-destructive-text border border-destructive/20" : "bg-[#E2F0E6] text-[#1E7A46] border border-[#1E7A46]/25"}`}
              >
                {vitalError || vitalMessage}
              </div>
            )}
          </div>

          <div className="bg-card border rounded-xl p-6 shadow-card overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold mb-5 flex items-center gap-3 tracking-tight">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FlaskConical className="h-5 w-5 text-primary" />
              </div>
              Laboratory Results
            </h2>
            <div className="flex-1 overflow-x-auto custom-scrollbar -mx-2 px-2 pb-2">
              <div className="min-w-0 sm:min-w-[400px]">
                {sortedLabs.length > 0 ? (
                  <>
                    <DataTable columns={labsColumns} data={sortedLabs.slice(0, 8)} />
                    {sortedLabs.length > 8 && (
                      <p className="mt-2 text-xs text-muted-foreground">Latest 8 of {sortedLabs.length} recorded results.</p>
                    )}
                  </>
                ) : (
                  <EmptyState
                    icon={FlaskConical}
                    title="No laboratory results"
                    description="Lab results recorded for this patient will appear here, newest first."
                    className="border-none bg-transparent px-2 py-8"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-6 shadow-card overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold mb-5 flex items-center gap-3 tracking-tight">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              Diagnoses
            </h2>
            {diagnoses.length > 0 ? (
              <ul className="space-y-2">
                {diagnoses.map((dx) => (
                  <li key={dx.id || dx.condition} className="flex items-center justify-between gap-4 rounded-xl border bg-background px-4 py-3 text-sm">
                    <span className="font-medium">{dx.condition}</span>
                    <span className="text-xs text-muted-foreground">{dx.diagnosed_at ? `Diagnosed ${fmtDate(dx.diagnosed_at)}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="No diagnoses on record"
                description="Diagnoses recorded for this patient will appear here."
                className="border-none bg-transparent px-2 py-8"
              />
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
