"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Download,
  RotateCcw,
  Stethoscope,
  ShieldAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { ALL_SYMPTOMS } from "@/lib/symptoms"

/* ------------------------------------------------------------------ */
/*  Static config                                                      */
/* ------------------------------------------------------------------ */

const STEPS = ["Select Symptoms", "Patient Details", "Screening Result", "Book Doctor"]

function formatSymptomLabel(id: string) {
  return id
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ")
}

type PatientDetails = {
  name: string
  age: string
  gender: string
  weight: string
  height: string
  bloodGroup: string
  phone: string
  email: string
}

type PredictionResult = {
  disease: string
  specialty: string
  confidence: number
  risk: "Low" | "Moderate" | "High" | "Critical"
  recommendations: string[]
  alternatives?: { disease: string; confidence: number }[]
}

type Doctor = {
  id: string
  full_name: string
  specialty: string
  avatar_url?: string | null
  bio?: string | null
  consultation_fee?: number | null
  availability_status?: string | null
  contact_number?: string | null
  hospitals?: { name: string } | null
}

// The canonical RiskBadge palette — the same tints as everywhere else.
const RISK_STYLES: Record<string, string> = {
  Low: "bg-[#E2F0E6] text-[#1E7A46] border-[#1E7A46]/30",
  Moderate: "bg-[#FDF0DC] text-[#A85008] border-[#D97706]/30",
  High: "bg-[#FAE9E7] text-[#C0392B] border-[#C0392B]/30",
  Critical: "bg-[#C0392B] text-white border-[#C0392B]",
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function PredictPage() {
  const [step, setStep] = useState(0)
  const [selectedSymptoms, setSelectedSymptoms] = useState<Set<string>>(new Set())
  const [symptomSearch, setSymptomSearch] = useState("")
  const [patient, setPatient] = useState<PatientDetails>({
    name: "", age: "", gender: "", weight: "", height: "", bloodGroup: "", phone: "", email: "",
  })
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [isPredicting, setIsPredicting] = useState(false)
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Focus management: when the step changes, focus moves to the new
  // step's heading so keyboard and screen-reader users land on the step
  // they just moved to (QA Round 1, item 56).
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  // The symptom list is static data (lib/symptoms, shared with the
  // scoring API route) — imported directly instead of fetched from
  // /api/predict-symptoms at runtime. There is no load failure mode to
  // render anymore; the API GET route still serves the same list.
  const filteredSymptoms = useMemo(() => {
    const q = symptomSearch.trim().toLowerCase()
    if (!q) return ALL_SYMPTOMS
    return ALL_SYMPTOMS.filter((s) => formatSymptomLabel(s).toLowerCase().includes(q))
  }, [symptomSearch])

  const toggleSymptom = (id: string) => {
    setSelectedSymptoms((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const goBack = () => setStep((s) => Math.max(s - 1, 0))

  const runPrediction = async () => {
    setIsPredicting(true)
    setError(null)
    try {
      const res = await fetch("/api/predict-symptoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symptoms: Array.from(selectedSymptoms) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Prediction failed.")
      setResult(data)
      goNext()
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : "Something went wrong while predicting.")
    } finally {
      setIsPredicting(false)
    }
  }

  const loadDoctors = async (specialty: string) => {
    setIsLoadingDoctors(true)
    // Referrals list APPROVED doctors only (QA Round 1, item 31), with
    // availability from the one source, availability_status.
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, specialty, avatar_url, bio, consultation_fee, availability_status, contact_number, hospitals(name), doctors!inner(status)")
      .eq("role", "doctor")
      .eq("doctors.status", "approved")
      .ilike("specialty", `%${specialty.split(" ")[0]}%`)
      .limit(6)
    setDoctors((data as unknown as Doctor[]) || [])
    setIsLoadingDoctors(false)
  }

  useEffect(() => {
    if (step === 3 && result) {
      loadDoctors(result.specialty)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, result])

  const resetWizard = () => {
    setStep(0)
    setSelectedSymptoms(new Set())
    setPatient({ name: "", age: "", gender: "", weight: "", height: "", bloodGroup: "", phone: "", email: "" })
    setResult(null)
    setDoctors([])
    setError(null)
  }

  const downloadReport = () => window.print()

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16 print:max-w-full">
      <div className="print:hidden">
        <p className="eyebrow mb-3">Rule-Based Symptom Screening</p>
        <h1 className="font-heading text-3xl font-bold">Disease Prediction Wizard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Answer a few questions and get an instant rule-based symptom screening, plus a matched specialist. This checker uses fixed symptom rules — it is not the trained prediction model.
        </p>
      </div>

      {/* Progress bar */}
      <div className="print:hidden">
        <div className="flex items-center">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-2">
                <div
                  aria-current={i === step ? "step" : undefined}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all ${
                    i < step
                      ? "border-primary bg-primary text-white"
                      : i === step
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {i < step ? <CheckCircle2 className="h-[18px] w-[18px]" /> : i + 1}
                </div>
                <span className={`hidden text-xs font-medium sm:block ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mx-2 h-0.5 flex-1 rounded ${i < step ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ---------------- Step 1: Symptoms ---------------- */}
        {step === 0 && (
          <motion.div key="symptoms" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 ref={headingRef} tabIndex={-1} className="font-heading text-lg font-bold outline-none">Select Symptoms</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose everything you&apos;re currently experiencing.</p>

            <div className="relative mt-5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={symptomSearch}
                onChange={(e) => setSymptomSearch(e.target.value)}
                placeholder="Search symptoms..."
                aria-label="Search symptoms"
                className="pl-9"
              />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filteredSymptoms.map((s) => (
                <label
                  key={s}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition ${
                    selectedSymptoms.has(s)
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSymptoms.has(s)}
                    onChange={() => toggleSymptom(s)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  {formatSymptomLabel(s)}
                </label>
              ))}
              {filteredSymptoms.length === 0 && (
                <p className="col-span-full text-sm text-muted-foreground">No symptoms match your search.</p>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{selectedSymptoms.size} selected</span>
              <Button onClick={goNext} disabled={selectedSymptoms.size === 0}>
                Continue <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* ---------------- Step 2: Patient Details ---------------- */}
        {step === 1 && (
          <motion.div key="details" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 ref={headingRef} tabIndex={-1} className="font-heading text-lg font-bold outline-none">Patient Details</h2>
            <p className="mt-1 text-sm text-muted-foreground">These details appear on the screening report. The match itself is based only on the symptoms you selected.</p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wiz-name">Full Name</Label>
                <Input id="wiz-name" autoComplete="name" value={patient.name} onChange={(e) => setPatient({ ...patient, name: e.target.value })} placeholder="e.g. Ayesha Khan" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-age">Age</Label>
                <Input id="wiz-age" type="number" value={patient.age} onChange={(e) => setPatient({ ...patient, age: e.target.value })} placeholder="32" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-gender">Gender</Label>
                <select
                  id="wiz-gender"
                  value={patient.gender}
                  onChange={(e) => setPatient({ ...patient, gender: e.target.value })}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-blood-group">Blood Group</Label>
                <select
                  id="wiz-blood-group"
                  value={patient.bloodGroup}
                  onChange={(e) => setPatient({ ...patient, bloodGroup: e.target.value })}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select</option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-weight">Weight (kg)</Label>
                <Input id="wiz-weight" type="number" value={patient.weight} onChange={(e) => setPatient({ ...patient, weight: e.target.value })} placeholder="68" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-height">Height (cm)</Label>
                <Input id="wiz-height" type="number" value={patient.height} onChange={(e) => setPatient({ ...patient, height: e.target.value })} placeholder="170" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-phone">Phone</Label>
                <Input id="wiz-phone" autoComplete="tel" value={patient.phone} onChange={(e) => setPatient({ ...patient, phone: e.target.value })} placeholder="+92 3xx xxxxxxx" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-email">Email</Label>
                <Input id="wiz-email" type="email" autoComplete="email" value={patient.email} onChange={(e) => setPatient({ ...patient, email: e.target.value })} placeholder="you@example.com" />
              </div>
            </div>

            {error && (
              <div role="alert" className="mt-5 flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <Button variant="outline" onClick={goBack}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
              <Button onClick={runPrediction} disabled={isPredicting || !patient.name || !patient.age}>
                {isPredicting ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Predicting...</> : <>Predict Disease <ArrowRight className="ml-1.5 h-4 w-4" /></>}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ---------------- Step 3: Screening Result ---------------- */}
        {step === 2 && result && (
          <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-6">
            <div id="report" className="print-report rounded-2xl border border-border bg-card p-7 shadow-premium">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow mb-3">Screening Result</p>
                  <h2 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-bold outline-none">{result.disease}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">for {patient.name}, {patient.age} yrs</p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">Rule-based screening result — a symptom-rule match, not a model prediction or a diagnosis.</p>
                </div>
                <span className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${RISK_STYLES[result.risk]}`}>
                  {result.risk} Risk
                </span>
              </div>

              {/* Print-only patient block: the printed result carries who
                  it belongs to and what was reported. */}
              <div className="mt-6 hidden border-t border-border pt-4 text-sm print:block">
                <p className="font-semibold">Patient details</p>
                <p className="mt-1 text-muted-foreground">
                  {patient.name} · {patient.age} yrs{patient.gender ? ` · ${patient.gender}` : ""}{patient.bloodGroup ? ` · Blood group ${patient.bloodGroup}` : ""}
                  {patient.weight ? ` · ${patient.weight} kg` : ""}{patient.height ? ` · ${patient.height} cm` : ""}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Symptoms reported: {Array.from(selectedSymptoms).map(formatSymptomLabel).join(", ") || "—"}
                </p>
                <p className="mt-1 text-muted-foreground">Screened: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Karachi" })}</p>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-secondary/50 p-4">
                  <div className="text-xs font-medium text-muted-foreground">Match</div>
                  <div className="mt-1 font-display text-3xl text-primary">{result.confidence}%</div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
                    <div className="h-full bg-brand" style={{ width: `${result.confidence}%` }} />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">How strongly the reported symptoms match this condition&apos;s rule set.</p>
                </div>
                <div className="rounded-xl bg-secondary/50 p-4">
                  <div className="text-xs font-medium text-muted-foreground">Suggested Specialist</div>
                  <div className="mt-1.5 flex items-center gap-2 font-heading text-lg font-bold">
                    <Stethoscope className="h-5 w-5 text-primary" /> {result.specialty}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-semibold">Recommendations</h3>
                <ul className="mt-2 space-y-2">
                  {result.recommendations.map((r) => (
                    <li key={r} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1E7A46]" /> {r}
                    </li>
                  ))}
                </ul>
              </div>

              {result.alternatives && result.alternatives.length > 0 && (
                <div className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
                  Other possibilities considered: {result.alternatives.map((a) => `${a.disease} (${a.confidence}% match)`).join(", ")}
                </div>
              )}

              <div className="mt-6 flex items-start gap-2 rounded-xl border border-[#D97706]/30 bg-[#FDF0DC] p-3.5 text-xs text-[#A85008]">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                This is a rule-based screening tool, not a medical diagnosis. Please consult a licensed doctor to confirm any results.
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
              <Button variant="outline" onClick={resetWizard}><RotateCcw className="mr-1.5 h-4 w-4" /> Predict Again</Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={downloadReport}><Download className="mr-1.5 h-4 w-4" /> Download Report</Button>
                <Button onClick={goNext}>Find a Doctor <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ---------------- Step 4: Doctor Suggestion ---------------- */}
        {step === 3 && (
          <motion.div key="doctors" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-5 print:hidden">
            <div>
              <h2 ref={headingRef} tabIndex={-1} className="font-heading text-lg font-bold outline-none">
                Recommended {result?.specialty}s {result && <span className="text-muted-foreground font-normal">for {result.disease}</span>}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Doctors matched to your predicted condition.</p>
            </div>

            {isLoadingDoctors ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Finding doctors...</div>
            ) : doctors.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No matching specialists found right now. <Link href="/doctors" className="text-primary hover:underline">Browse all doctors</Link> instead.
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {doctors.map((doc) => (
                  <div key={doc.id} className="flex gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-card">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-secondary">
                      {doc.avatar_url ? (
                        <Image src={doc.avatar_url} alt={doc.full_name} fill sizes="64px" className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-brand text-sm font-bold text-white">
                          {doc.full_name?.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-heading text-sm font-bold">{doc.full_name}</h3>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${doc.availability_status === "available" ? "bg-[#1E7A46]" : "bg-muted-foreground/40"}`} title={doc.availability_status === "available" ? "Available" : "Not currently available"} />
                      </div>
                      <p className="text-xs text-primary">{doc.specialty}</p>
                      {doc.hospitals?.name && <p className="mt-0.5 text-xs text-muted-foreground">{doc.hospitals.name}</p>}
                      {doc.bio && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{doc.bio}</p>}
                      <div className="mt-3 flex items-center justify-between">
                        {doc.consultation_fee ? <span className="text-xs font-semibold">Rs. {Number(doc.consultation_fee).toLocaleString()}</span> : <span />}
                        <div className="flex gap-2">
                          <Link href={`/doctors/${doc.id}`} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted">
                            View Profile
                          </Link>
                          <Link href={`/doctors/${doc.id}`} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90">
                            Book
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={goBack}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Result</Button>
              <Button variant="outline" onClick={resetWizard}><RotateCcw className="mr-1.5 h-4 w-4" /> Start Over</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
