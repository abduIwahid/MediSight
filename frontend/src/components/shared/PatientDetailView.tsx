"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { PatientRiskCard } from "@/components/shared/PatientRiskCard"
import { DataTable } from "@/components/shared/DataTable"
import { RunPredictionButton } from "@/components/shared/RunPredictionButton"
import { RiskTrendChart } from "@/components/shared/RiskTrendChart"
import { EmptyState } from "@/components/shared/EmptyState"
import Link from "next/link"
import { ArrowLeft, User, Calendar, Activity, FlaskConical, Stethoscope, Heart, Pencil, Trash2, TrendingUp, ClipboardList } from "lucide-react"
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
}

export function PatientDetailView({ patient, latestPrediction, isAdmin = false }: PatientDetailViewProps) {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

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

  const [demographics, setDemographics] = useState({
    first_name: patient.demographics?.first_name || "",
    last_name: patient.demographics?.last_name || "",
    age: String(patient.demographics?.age || ""),
    gender: patient.demographics?.gender || "",
  })

  useEffect(() => {
    setDemographics({
      first_name: patient.demographics?.first_name || "",
      last_name: patient.demographics?.last_name || "",
      age: String(patient.demographics?.age || ""),
      gender: patient.demographics?.gender || "",
    })
  }, [patient])

  const name = getPatientName(patient)
  const d = patient.demographics || {}
  const dobRaw = d.birth_date || d.dob
  const age = d.age || (
    dobRaw
      ? Math.floor((Date.now() - new Date(dobRaw).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null
  )
  const gender = d.gender ? d.gender.charAt(0).toUpperCase() + d.gender.slice(1).toLowerCase() : "—"
  const dob = dobRaw ? fmtDate(dobRaw) : "—"

  const handleSaveUpdates = async () => {
    setSaving(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const updatePayload: { demographics: PatientDemographics } = {
        demographics: {
          ...patient.demographics,
          first_name: demographics.first_name,
          last_name: demographics.last_name,
          gender: demographics.gender,
          age: Number(demographics.age) || null,
        }
      }

      const { error } = await supabase
        .from('patients')
        .update(updatePayload)
        .eq('id', patient.id)

      if (error) throw error

      if (newLab.test_name && newLab.value) {
        const { error: labError } = await supabase.from('lab_results').insert({
          patient_id: patient.id,
          test_name: newLab.test_name,
          value: newLab.value,
          unit: newLab.unit || "",
          recorded_at: newLab.recorded_at,
        })
        if (labError) throw labError
      }

      setStatusMessage('Patient record updated successfully.')
      setNewLab({ test_name: "", value: "", unit: "", recorded_at: new Date().toISOString().slice(0, 10) })
      setEditMode(false)
      router.refresh()
    } catch (error: unknown) {
      // Never render the raw database error — log it, say it plainly.
      console.error("Patient update failed:", error)
      setErrorMessage('Unable to save patient updates. Please check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePatient = async () => {
    if (!window.confirm('Delete this patient record? This action cannot be undone.')) return
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
    { header: "Date", cell: (v: VitalRow) => fmtDate(v.recorded_at) }
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
  const sortedVitals = [...(patient.vitals || [])].sort((a, b) =>
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
      <motion.div variants={itemVariants} className="flex flex-col gap-6 lg:gap-0 lg:flex-row lg:items-start lg:justify-between bg-card p-6 rounded-2xl border shadow-sm">
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
                <h1 className="text-3xl font-extrabold tracking-tight">{name}</h1>
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

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={editMode ? "default" : "outline"} className="rounded-xl transition-all hover:shadow-md" onClick={() => setEditMode((open) => !open)}>
              <Pencil className="mr-2 h-4 w-4" /> {editMode ? 'Cancel Edit' : 'Update Profile'}
            </Button>
            <Button variant="destructive" className="rounded-xl transition-all hover:shadow-md" onClick={handleDeletePatient} disabled={deleteLoading}>
              <Trash2 className="mr-2 h-4 w-4" /> {deleteLoading ? 'Deleting…' : 'Delete Record'}
            </Button>
          </div>
        )}
      </motion.div>

      {!editMode && errorMessage && (
        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive">
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
            <div className="bg-card border rounded-2xl p-6 shadow-md space-y-5 my-4 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary rounded-l-2xl"></div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">Admin Update Mode</h2>
                  <p className="text-sm text-muted-foreground mt-1">Edit patient demographics and register new laboratory results.</p>
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
                  className={`rounded-xl p-4 text-sm font-medium flex items-center gap-2 ${errorMessage ? 'bg-destructive/10 text-destructive border border-destructive/20' : 'bg-[#E2F0E6] text-[#1E7A46] border border-[#1E7A46]/25'}`}
                >
                  {errorMessage || statusMessage}
                </motion.div>
              )}

              <div className="flex flex-wrap gap-3 pt-4 border-t border-border/50">
                <Button onClick={handleSaveUpdates} disabled={saving} className="rounded-xl h-11 px-6 shadow-md transition-all hover:shadow-lg">
                  {saving ? 'Saving changes…' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => setEditMode(false)} className="rounded-xl h-11 px-6">
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
          { label: "Vitals Tracked", icon: Activity, value: `${patient.vitals?.length || 0} records` },
          { label: "Lab Results", icon: FlaskConical, value: `${patient.lab_results?.length || 0} results` },
        ].map((stat, i) => (
          <div key={i} className="group bg-card border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col items-start gap-2 relative overflow-hidden">
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
            <div className="bg-card border rounded-2xl p-8 shadow-sm flex flex-col items-center text-center space-y-5">
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
            <div className="bg-card border rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-primary uppercase tracking-widest mb-4">Run Updated Assessment</h3>
              <RunPredictionButton patient={patient} onResult={setFreshPrediction} />
            </div>
          )}

          {sortedPreds.length >= 1 && (
            <div className="bg-card border rounded-2xl p-5 shadow-sm">
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
            <div className="bg-card border rounded-2xl p-5 shadow-sm">
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
          <div className="bg-card border rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col">
            <h2 className="text-lg font-bold mb-5 flex items-center gap-3 tracking-tight">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              Recent Vitals
            </h2>
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
          </div>

          <div className="bg-card border rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col">
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

          <div className="bg-card border rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col">
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
