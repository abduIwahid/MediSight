"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { brfssAgeBand, INTAKE_RISK_FACTOR_KEYS } from "@/lib/prediction-features"
import { useStagedLoadingLabel } from "@/lib/use-staged-loading-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, ArrowLeft, HeartPulse, Stethoscope, TestTube2, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { motion, type Variants } from "framer-motion"

export default function NewPatientPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(null)
  const submitLabel = useStagedLoadingLabel(loading, "Generating AI Prediction...")

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    age: "",
    gender: "",
    // No pre-filled vitals: a default BMI/BP left in place by a rushed
    // clinician would be stored as if it had been measured.
    bmi: "",
    bpSystolic: "",
    highChol: false,
    smoker: false,
    historyHeartDisease: false,
    historyStroke: false,
    physActivity: true,
    genHlth: "3",
    labs: [
      { testName: "", value: "", unit: "", recordedAt: new Date().toISOString().slice(0, 10) }
    ]
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    setWarning(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Authentication required")

      const { data: profile } = await supabase
        .from("profiles")
        .select("hospital_id")
        .eq("id", user.id)
        .single()

      // Resolve hospital_id — fallback to first available hospital if doctor has none set
      let resolvedHospitalId = profile?.hospital_id || null
      if (!resolvedHospitalId) {
        const { data: firstHospital } = await supabase
          .from("hospitals")
          .select("id")
          .limit(1)
          .single()
        resolvedHospitalId = firstHospital?.id || null
      }
      if (!resolvedHospitalId) throw new Error("No hospital is configured for your account yet. Please ask an admin to set up a hospital before adding patients.")

      // 1. Run the model FIRST. Until the score exists, nothing is
      // written: if the ML service is down (503), the submit aborts here
      // and no half-created patient record is left behind.
      const ageNum = parseInt(formData.age)
      const ageGroup = brfssAgeBand(ageNum)
      const bmiNum = parseFloat(formData.bmi)
      if (!Number.isFinite(bmiNum)) throw new Error("Please enter the patient's measured BMI.")
      const bpNum = parseInt(formData.bpSystolic)
      if (!Number.isFinite(bpNum)) throw new Error("Please enter the patient's measured systolic blood pressure.")
      const bpHigh = bpNum >= 130 ? 1.0 : 0.0

      const mlPayload = {
        HighBP: bpHigh,
        HighChol: formData.highChol ? 1.0 : 0.0,
        CholCheck: 1.0,
        BMI: bmiNum,
        Smoker: formData.smoker ? 1.0 : 0.0,
        Stroke: formData.historyStroke ? 1.0 : 0.0,
        HeartDiseaseorAttack: formData.historyHeartDisease ? 1.0 : 0.0,
        PhysActivity: formData.physActivity ? 1.0 : 0.0,
        Fruits: 1.0,
        Veggies: 1.0,
        HvyAlcoholConsump: 0.0,
        AnyHealthcare: 1.0,
        NoDocbcCost: 0.0,
        GenHlth: parseFloat(formData.genHlth) || 3.0,
        MentHlth: 0.0,
        PhysHlth: 0.0,
        DiffWalk: 0.0,
        Sex: formData.gender === "Male" ? 1.0 : 0.0,
        Age: ageGroup,
        Education: 5.0,
        Income: 6.0,
      }

      const mlRes = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mlPayload),
      })

      if (!mlRes.ok) {
        const errBody = await mlRes.json().catch(() => null)
        throw new Error(errBody?.error || "Prediction request failed")
      }

      const prediction = await mlRes.json()

      // 2. Insert Patient
      const mrn = `MRN-${Math.floor(Math.random() * 900000) + 100000}`
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .insert({
          mrn,
          demographics: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            age: parseInt(formData.age),
            gender: formData.gender,
            birth_date: new Date(
              new Date().setFullYear(new Date().getFullYear() - parseInt(formData.age))
            ).toISOString(),
            // The four risk factors collected on this form are persisted
            // with the record, so every later re-run scores the values
            // entered here instead of silently falling back to the
            // population defaults in buildMLPayload (QA Round 2, cluster 2).
            [INTAKE_RISK_FACTOR_KEYS.HighChol]: formData.highChol ? 1 : 0,
            [INTAKE_RISK_FACTOR_KEYS.Smoker]: formData.smoker ? 1 : 0,
            [INTAKE_RISK_FACTOR_KEYS.PhysActivity]: formData.physActivity ? 1 : 0,
            [INTAKE_RISK_FACTOR_KEYS.GenHlth]: parseFloat(formData.genHlth) || 3,
          },
          hospital_id: resolvedHospitalId,
        })
        .select()
        .single()

      if (patientError || !patient) throw new Error(`Patient Error: ${patientError?.message}`)

      // From here on the patient row exists — every failure must say so
      // honestly instead of implying nothing was saved.
      const partial = (what: string, detail?: string) =>
        new Error(`The patient was created, but ${what} could not be saved${detail ? `: ${detail}` : ""}. Open the patient record to review what is missing.`)

      // 3. Assign the creating clinician — the Risk Queue reads
      // doctor_patient_assignments; best-effort (duplicate/RLS refusal
      // must not block registration).
      await supabase.from("doctor_patient_assignments").insert({
        doctor_id: user.id,
        patient_id: patient.id,
        hospital_id: resolvedHospitalId,
      })

      // 4. Insert Vitals
      const now = new Date().toISOString()
      const { error: vitalsError } = await supabase.from("vitals").insert([
        { patient_id: patient.id, type: "BMI", value: formData.bmi, unit: "kg/m²", recorded_at: now },
        { patient_id: patient.id, type: "Blood Pressure Systolic", value: formData.bpSystolic, unit: "mmHg", recorded_at: now },
      ])
      if (vitalsError) throw partial("the vitals", vitalsError.message)

      // 5. Insert Lab Results
      const labRows = formData.labs
        .filter(l => l.testName.trim() && l.value.trim())
        .map((lab) => ({
          patient_id: patient.id,
          test_name: lab.testName,
          value: lab.value,
          unit: lab.unit,
          recorded_at: lab.recordedAt || now,
        }))

      if (labRows.length > 0) {
        const { error: labsError } = await supabase.from("lab_results").insert(labRows)
        if (labsError) throw partial("the lab results", labsError.message)
      }

      // 6. Insert Diagnoses History
      const diagnosesToInsert = []
      const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD date only
      if (formData.historyHeartDisease)
        diagnosesToInsert.push({ patient_id: patient.id, condition: "Heart Disease", diagnosed_at: today })
      if (formData.historyStroke)
        diagnosesToInsert.push({ patient_id: patient.id, condition: "Stroke", diagnosed_at: today })
      if (diagnosesToInsert.length > 0) {
        const { error: diagnosesError } = await supabase.from("diagnoses").insert(diagnosesToInsert)
        if (diagnosesError) throw partial("the medical history", diagnosesError.message)
      }

      // 7. Save the prediction (only confirmed schema columns)
      const { data: savedPrediction, error: predSaveErr } = await supabase
        .from("predictions")
        .insert({
          patient_id: patient.id,
          disease: "Diabetes",
          probability: prediction.probability,
          severity: prediction.severity,
          confidence: prediction.confidence,
          model_version: prediction.model_version,
        })
        .select("id")
        .single()

      if (predSaveErr || !savedPrediction) {
        throw partial("the prediction", predSaveErr?.message)
      }

      // Non-blocking follow-ups: if any of these fail, the page shows a
      // warning with a link to the record instead of navigating away and
      // hiding it.
      const warnings: string[] = []

      // 8 + 9 run in PARALLEL: snapshot the exact inputs this score was
      // computed from (predictions.features, migration 20261025200000 —
      // a follow-up update, NOT part of the insert, because the column
      // only exists once that migration is applied; its failure stays
      // tolerated) and persist the SHAP explanation (/predict returns
      // none, so /explain is called with the same payload; stored in the
      // array shape the detail page/report render).
      const explainPromise = (async (): Promise<string | null> => {
        try {
          const expRes = await fetch("/api/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mlPayload),
          })
          if (!expRes.ok) throw new Error("Explanation request failed")
          const explanation = await expRes.json()
          const shapPayload = Object.entries(
            (explanation.shap_values ?? {}) as Record<string, number>
          ).map(([feature, impact]) => ({
            feature,
            value: (mlPayload as Record<string, number>)[feature] ?? null,
            impact: Number(impact),
          }))
          const { error: expErr } = await supabase.from("explanations").insert({
            prediction_id: savedPrediction.id,
            shap_payload: shapPayload,
            clinical_explanation: explanation.clinical_explanation,
          })
          if (expErr) throw new Error(expErr.message)
          return null
        } catch {
          return "its SHAP explanation could not be stored — the detail page will show this score without factor contributions"
        }
      })()

      const [{ error: featuresErr }, explainWarning] = await Promise.all([
        supabase.from("predictions").update({ features: mlPayload }).eq("id", savedPrediction.id),
        explainPromise,
      ])
      if (featuresErr) {
        console.warn("Prediction feature snapshot was not stored:", featuresErr.message)
      }
      if (explainWarning) warnings.push(explainWarning)

      // 10. Auto-generate alert for High or Critical risk patients
      if (prediction.severity === "High" || prediction.severity === "Critical") {
        const { error: alertErr } = await supabase.from("alerts").insert({
          patient_id: patient.id,
          type: `${prediction.severity} Diabetes Risk`,
          severity: prediction.severity,
          status: "New",
        })
        if (alertErr) warnings.push("the high-risk alert could not be created")
      }

      if (warnings.length > 0) {
        setCreatedPatientId(patient.id)
        setWarning(`The patient and prediction were saved, but ${warnings.join("; and ")}.`)
        setLoading(false)
        return
      }

      // 11. Navigate to patient detail page
      router.push(`/patients/${patient.id}`)
    } catch (err: unknown) {
      console.error(err)
      setError(err instanceof Error && err.message ? err.message : "An unexpected error occurred while creating the patient and prediction.")
      setLoading(false)
    }
  }

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
      className="mx-auto max-w-4xl space-y-6 pb-12"
    >
      <motion.div variants={itemVariants} className="flex items-center gap-5">
        <Link href="/patients">
          <button type="button" className="h-10 w-10 rounded-full border border-border/50 bg-muted/30 flex items-center justify-center hover:bg-muted hover:scale-105 transition-all shadow-sm">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">New Patient Assessment</h1>
          <p className="text-muted-foreground mt-1">Input clinical data to immediately trigger the predictive AI model.</p>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card className="rounded-2xl shadow-sm border overflow-hidden">
          <form onSubmit={handleSubmit}>
            <CardHeader className="bg-muted/10 border-b pb-6">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Stethoscope className="h-5 w-5 text-primary" /> Clinical Profile Registration
              </CardTitle>
              <CardDescription>
                All fields will be processed by the LightGBM engine in real-time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 pt-8">
              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="p-4 bg-destructive/10 text-destructive rounded-xl border border-destructive/20 text-sm font-medium flex items-start gap-3"
                >
                  <Loader2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <p>{error}</p>
                </motion.div>
              )}

              {warning && (
                <div className="p-4 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-xl border border-amber-500/20 text-sm font-medium flex items-start justify-between gap-3">
                  <p>{warning}</p>
                  {createdPatientId && (
                    <Link href={`/patients/${createdPatientId}`} className="shrink-0 font-semibold underline underline-offset-2">
                      Open patient record
                    </Link>
                  )}
                </div>
              )}

              {/* Patient Identity */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">1</span>
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-primary">Patient Demographics</h3>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="font-semibold">First Name</Label>
                    <Input
                      id="firstName"
                      className="h-11 rounded-xl transition-all focus:ring-2 focus:ring-primary/20"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="font-semibold">Last Name</Label>
                    <Input
                      id="lastName"
                      className="h-11 rounded-xl transition-all focus:ring-2 focus:ring-primary/20"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="age" className="font-semibold">Age</Label>
                    <Input
                      id="age"
                      type="number"
                      className="h-11 rounded-xl transition-all focus:ring-2 focus:ring-primary/20"
                      required
                      min="1"
                      max="120"
                      value={formData.age}
                      onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold">Gender</Label>
                    <Select
                      required
                      value={formData.gender}
                      onValueChange={(val) => setFormData({ ...formData, gender: val })}
                    >
                      <SelectTrigger className="h-11 rounded-xl transition-all focus:ring-2 focus:ring-primary/20">
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
              </div>

              {/* Clinical Measurements */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">2</span>
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                    <HeartPulse className="h-4 w-4" /> Vitals & Health
                  </h3>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="bmi" className="font-semibold">BMI</Label>
                    <Input
                      id="bmi"
                      type="number"
                      step="0.1"
                      className="h-11 rounded-xl"
                      placeholder="e.g. 25.5"
                      required
                      value={formData.bmi}
                      onChange={(e) => setFormData({ ...formData, bmi: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bpSystolic" className="font-semibold">Systolic Blood Pressure</Label>
                    <div className="relative">
                      <Input
                        id="bpSystolic"
                        type="number"
                        className="h-11 rounded-xl pr-12"
                        placeholder="e.g. 120"
                        required
                        value={formData.bpSystolic}
                        onChange={(e) => setFormData({ ...formData, bpSystolic: e.target.value })}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">mmHg</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="genHlth" className="font-semibold">General Health</Label>
                    <Select
                      value={formData.genHlth}
                      onValueChange={(val) => setFormData({ ...formData, genHlth: val })}
                    >
                      <SelectTrigger id="genHlth" className="h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 — Excellent</SelectItem>
                        <SelectItem value="2">2 — Very Good</SelectItem>
                        <SelectItem value="3">3 — Good</SelectItem>
                        <SelectItem value="4">4 — Fair</SelectItem>
                        <SelectItem value="5">5 — Poor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Lab Results */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">3</span>
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                      <TestTube2 className="h-4 w-4" /> Laboratory Results
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      labs: [
                        ...formData.labs,
                        { testName: "", value: "", unit: "", recordedAt: new Date().toISOString().slice(0, 10) }
                      ]
                    })}
                    className="text-xs font-bold text-primary hover:underline bg-primary/10 px-3 py-1.5 rounded-full transition-colors hover:bg-primary/20"
                  >
                    + Add Test
                  </button>
                </div>

                <div className="space-y-4 bg-muted/20 p-4 rounded-xl border border-dashed">
                  {formData.labs.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No lab tests added yet.</p>
                  )}
                  {formData.labs.map((lab, index) => (
                    <motion.div 
                      key={index} 
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      className="grid gap-4 sm:grid-cols-12 items-end bg-card p-3 rounded-xl border shadow-sm"
                    >
                      <div className="space-y-2 sm:col-span-4">
                        <Label htmlFor={`lab-${index}-name`} className="text-xs">Test Name</Label>
                        <Input
                          id={`lab-${index}-name`}
                          className="h-10 rounded-lg"
                          value={lab.testName}
                          onChange={(e) => {
                            const labs = [...formData.labs]
                            labs[index].testName = e.target.value
                            setFormData({ ...formData, labs })
                          }}
                          placeholder="e.g. HbA1c"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-3">
                        <Label htmlFor={`lab-${index}-value`} className="text-xs">Value</Label>
                        <Input
                          id={`lab-${index}-value`}
                          className="h-10 rounded-lg"
                          value={lab.value}
                          onChange={(e) => {
                            const labs = [...formData.labs]
                            labs[index].value = e.target.value
                            setFormData({ ...formData, labs })
                          }}
                          placeholder="e.g. 6.8"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`lab-${index}-unit`} className="text-xs">Unit</Label>
                        <Input
                          id={`lab-${index}-unit`}
                          className="h-10 rounded-lg"
                          value={lab.unit}
                          onChange={(e) => {
                            const labs = [...formData.labs]
                            labs[index].unit = e.target.value
                            setFormData({ ...formData, labs })
                          }}
                          placeholder="e.g. %"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-3 flex items-center justify-between">
                        <div className="w-full">
                          <Label htmlFor={`lab-${index}-date`} className="text-xs">Date</Label>
                          <Input
                            id={`lab-${index}-date`}
                            type="date"
                            className="h-10 rounded-lg"
                            value={lab.recordedAt}
                            onChange={(e) => {
                              const labs = [...formData.labs]
                              labs[index].recordedAt = e.target.value
                              setFormData({ ...formData, labs })
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const labs = [...formData.labs]
                            labs.splice(index, 1)
                            setFormData({ ...formData, labs })
                          }}
                          className="text-xs font-semibold text-destructive hover:bg-destructive/10 p-2 rounded-lg ml-2 mt-6 transition-colors"
                          title="Remove Lab"
                        >
                          X
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Medical History */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">4</span>
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Medical History & Lifestyle
                  </h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-y-4 gap-x-8 bg-muted/10 p-5 rounded-xl border border-dashed">
                  {[
                    { key: "historyHeartDisease", label: "Prior Heart Disease or Attack" },
                    { key: "historyStroke", label: "Prior Stroke" },
                    { key: "highChol", label: "High Cholesterol" },
                    { key: "smoker", label: "Smoker (≥100 cigarettes in lifetime)" },
                    { key: "physActivity", label: "Physically Active (past 30 days)" },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center space-x-3 group">
                      <div className="relative flex items-start">
                        <input
                          type="checkbox"
                          id={key}
                          className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary/50 transition-all cursor-pointer"
                          checked={formData[key as keyof typeof formData] as boolean}
                          onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
                        />
                      </div>
                      <label htmlFor={key} className="text-sm font-medium leading-none cursor-pointer group-hover:text-primary transition-colors">
                        {label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t bg-muted/20 p-6 sm:px-8">
              <button
                type="submit"
                className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-card transition hover:bg-primary/90 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                    {submitLabel}
                  </>
                ) : (
                  "Save Patient & Run AI Prediction"
                )}
              </button>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </motion.div>
  )
}
