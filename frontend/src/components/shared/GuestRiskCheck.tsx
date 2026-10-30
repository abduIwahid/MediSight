"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Loader2, RotateCcw, ShieldAlert } from "lucide-react"
import { brfssAgeBand } from "@/lib/prediction-features"
import { severityPillClass } from "@/lib/status"

/**
 * The public quick risk check on the landing page.
 *
 * Guests answer the same 21 BRFSS questions the clinical intake asks;
 * the answers go to /api/guest-risk, which runs the real trained model
 * and returns only the score and band. Nothing is stored and no
 * account is needed. Untouched yes/no questions start at the model's
 * own population defaults (the same FEATURE_DEFAULTS the clinical
 * payload builder uses) — they are starting points the visitor can
 * change, not hidden assumptions: every question is visible.
 */

type YesNo = 0 | 1

const HISTORY_QUESTIONS: { key: string; label: string }[] = [
  { key: "HighBP", label: "Have you ever been told you have high blood pressure?" },
  { key: "HighChol", label: "Have you ever been told you have high cholesterol?" },
  { key: "CholCheck", label: "Cholesterol checked in the last 5 years?" },
  { key: "Stroke", label: "Have you ever had a stroke?" },
  { key: "HeartDiseaseorAttack", label: "Heart disease or a heart attack?" },
  { key: "DiffWalk", label: "Serious difficulty walking or climbing stairs?" },
  { key: "Smoker", label: "Smoked at least 100 cigarettes in your lifetime?" },
]

const LIFESTYLE_QUESTIONS: { key: string; label: string }[] = [
  { key: "PhysActivity", label: "Physically active in the past 30 days?" },
  { key: "Fruits", label: "Eat fruit at least once a day?" },
  { key: "Veggies", label: "Eat vegetables at least once a day?" },
  { key: "HvyAlcoholConsump", label: "Heavy alcohol use?" },
  { key: "AnyHealthcare", label: "Do you have any form of health coverage?" },
  { key: "NoDocbcCost", label: "Skipped seeing a doctor in the past year because of cost?" },
]

const GEN_HLTH_OPTIONS = [
  { value: 1, label: "Excellent" },
  { value: 2, label: "Very good" },
  { value: 3, label: "Good" },
  { value: 4, label: "Fair" },
  { value: 5, label: "Poor" },
]

const EDUCATION_OPTIONS = [
  { value: 1, label: "Never attended school or only kindergarten" },
  { value: 2, label: "Grades 1–8" },
  { value: 3, label: "Grades 9–11" },
  { value: 4, label: "High school graduate" },
  { value: 5, label: "Some college or technical school" },
  { value: 6, label: "College graduate" },
]

const INCOME_OPTIONS = [
  { value: 1, label: "Under $10,000" },
  { value: 2, label: "$10,000–$15,000" },
  { value: 3, label: "$15,000–$20,000" },
  { value: 4, label: "$20,000–$25,000" },
  { value: 5, label: "$25,000–$35,000" },
  { value: 6, label: "$35,000–$50,000" },
  { value: 7, label: "$50,000–$75,000" },
  { value: 8, label: "$75,000 or more" },
]

function YesNoToggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: YesNo
  onChange: (v: YesNo) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm leading-snug text-foreground/85">{label}</span>
      <span className="flex shrink-0 overflow-hidden rounded-lg border border-border" role="group" aria-label={label}>
        {([1, 0] as YesNo[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`px-3.5 py-1.5 text-xs font-bold transition ${
              value === v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-secondary"
            }`}
          >
            {v === 1 ? "Yes" : "No"}
          </button>
        ))}
      </span>
    </div>
  )
}

const inputClass =
  "h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"

export function GuestRiskCheck() {
  const [age, setAge] = useState("")
  const [sex, setSex] = useState<YesNo>(0)
  const [heightCm, setHeightCm] = useState("")
  const [weightKg, setWeightKg] = useState("")
  const [answers, setAnswers] = useState<Record<string, YesNo>>({
    HighBP: 0, HighChol: 0, CholCheck: 1, Stroke: 0, HeartDiseaseorAttack: 0,
    DiffWalk: 0, Smoker: 0, PhysActivity: 1, Fruits: 1, Veggies: 1,
    HvyAlcoholConsump: 0, AnyHealthcare: 1, NoDocbcCost: 0,
  })
  const [genHlth, setGenHlth] = useState(3)
  const [mentHlth, setMentHlth] = useState("0")
  const [physHlth, setPhysHlth] = useState("0")
  const [education, setEducation] = useState(4)
  const [income, setIncome] = useState(6)

  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [result, setResult] = useState<{ probability: number; severity: string } | null>(null)

  const bmi = useMemo(() => {
    const h = Number(heightCm) / 100
    const w = Number(weightKg)
    if (!h || !w) return null
    const value = w / (h * h)
    return Number.isFinite(value) ? value : null
  }, [heightCm, weightKg])

  const setAnswer = (key: string) => (v: YesNo) =>
    setAnswers((prev) => ({ ...prev, [key]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === "sending") return
    setErrorMessage(null)

    const ageYears = Number(age)
    if (!ageYears || ageYears < 18 || ageYears > 100) {
      setStatus("error")
      setErrorMessage("Please enter an age between 18 and 100 — the model was trained on adults.")
      return
    }
    const h = Number(heightCm)
    const w = Number(weightKg)
    if (!h || h < 100 || h > 230 || !w || w < 25 || w > 350 || bmi === null || bmi < 10 || bmi > 80) {
      setStatus("error")
      setErrorMessage("Please check the height and weight — together they give a BMI the model can use (10–80).")
      return
    }
    const ment = Number(mentHlth)
    const phys = Number(physHlth)
    if (!Number.isFinite(ment) || ment < 0 || ment > 30 || !Number.isFinite(phys) || phys < 0 || phys > 30) {
      setStatus("error")
      setErrorMessage("The two 'days' questions take a number between 0 and 30.")
      return
    }

    setStatus("sending")
    try {
      const res = await fetch("/api/guest-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...answers,
          BMI: Math.round(bmi * 10) / 10,
          Sex: sex,
          Age: brfssAgeBand(ageYears),
          GenHlth: genHlth,
          MentHlth: ment,
          PhysHlth: phys,
          Education: education,
          Income: income,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || "The risk check could not be completed. Please try again.")
      }
      setResult({ probability: data.probability, severity: data.severity })
      setStatus("done")
    } catch (err) {
      setStatus("error")
      setErrorMessage(
        err instanceof Error && err.message ? err.message : "The risk check could not be completed. Please try again."
      )
    }
  }

  if (status === "done" && result) {
    const pct = Math.round(result.probability * 100)
    return (
      <div className="rounded-[14px] border border-border bg-card p-[22px] shadow-premium" role="status">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[1.6px] text-muted-foreground">
            Your estimate · Diabetes risk
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${severityPillClass[result.severity] ?? ""}`}>
            {result.severity} risk
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-display text-[52px] leading-none">
            {result.probability.toFixed(2)}{" "}
            <small className="font-sans text-sm font-semibold text-muted-foreground">/ 1.00 probability ({pct}%)</small>
          </span>
        </div>
        <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>LOW</span>
          <span>MODERATE</span>
          <span>HIGH</span>
          <span>CRITICAL</span>
        </div>

        <div className="mt-5 flex items-start gap-2.5 rounded-[10px] border border-[#D97706] bg-[#FDF0DC] px-4 py-3 text-[13.5px] leading-relaxed text-[#A85008]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>This is an educational estimate, not a diagnosis.</strong> It comes from a statistical
            model trained on survey data, and it can be wrong in either direction. Only a clinician who
            knows your full history can assess your actual risk — if this number concerns you, talk to a
            doctor.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center rounded-lg bg-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-brand/90"
          >
            Create your account <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => { setStatus("idle"); setResult(null) }}
            className="inline-flex items-center rounded-lg border-[1.5px] border-primary px-5 py-3 text-sm font-bold text-primary transition hover:bg-secondary"
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Check again
          </button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          With a free patient account you can book appointments, and your care team can run a full
          assessment on your record — with the reasons behind the score explained factor by factor.
          Your quick-check answers were not saved.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[14px] border border-border bg-card p-[22px] shadow-premium"
    >
      <div className="grid gap-x-8 lg:grid-cols-2">
        <div>
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[1.6px] text-brand-text">About you</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="grc-age" className="text-sm font-medium">Age (years)</label>
              <input id="grc-age" type="number" min={18} max={100} className={inputClass} value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 47" required />
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Sex</span>
              <span className="flex overflow-hidden rounded-xl border border-input" role="group" aria-label="Sex">
                {([{ v: 0 as YesNo, label: "Female" }, { v: 1 as YesNo, label: "Male" }]).map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={sex === o.v}
                    onClick={() => setSex(o.v)}
                    className={`h-11 flex-1 text-sm font-semibold transition ${sex === o.v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-secondary"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </span>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="grc-height" className="text-sm font-medium">Height (cm)</label>
              <input id="grc-height" type="number" min={100} max={230} className={inputClass} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="e.g. 170" required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="grc-weight" className="text-sm font-medium">Weight (kg)</label>
              <input id="grc-weight" type="number" min={25} max={350} className={inputClass} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="e.g. 78" required />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
            {bmi !== null ? `Your BMI works out to ${bmi.toFixed(1)}.` : "Height and weight give your BMI, one of the model's inputs."}
          </p>

          <h3 className="mt-6 font-mono text-[11px] font-semibold uppercase tracking-[1.6px] text-brand-text">Health history</h3>
          <div className="mt-1 divide-y divide-foreground/[0.06]">
            {HISTORY_QUESTIONS.map((q) => (
              <YesNoToggle key={q.key} label={q.label} value={answers[q.key]} onChange={setAnswer(q.key)} />
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[1.6px] text-brand-text">Lifestyle &amp; access</h3>
          <div className="mt-1 divide-y divide-foreground/[0.06]">
            {LIFESTYLE_QUESTIONS.map((q) => (
              <YesNoToggle key={q.key} label={q.label} value={answers[q.key]} onChange={setAnswer(q.key)} />
            ))}
          </div>

          <h3 className="mt-6 font-mono text-[11px] font-semibold uppercase tracking-[1.6px] text-brand-text">How you have been</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="grc-genhlth" className="text-sm font-medium">General health</label>
              <select id="grc-genhlth" className={inputClass} value={genHlth} onChange={(e) => setGenHlth(Number(e.target.value))}>
                {GEN_HLTH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="grc-education" className="text-sm font-medium">Education</label>
              <select id="grc-education" className={inputClass} value={education} onChange={(e) => setEducation(Number(e.target.value))}>
                {EDUCATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="grc-ment" className="text-sm font-medium">Poor mental-health days (past 30)</label>
              <input id="grc-ment" type="number" min={0} max={30} className={inputClass} value={mentHlth} onChange={(e) => setMentHlth(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="grc-phys" className="text-sm font-medium">Poor physical-health days (past 30)</label>
              <input id="grc-phys" type="number" min={0} max={30} className={inputClass} value={physHlth} onChange={(e) => setPhysHlth(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label htmlFor="grc-income" className="text-sm font-medium">Household income (the survey band the model was trained with)</label>
              <select id="grc-income" className={inputClass} value={income} onChange={(e) => setIncome(Number(e.target.value))}>
                {INCOME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {status === "error" && errorMessage && (
        <div role="alert" className="mt-5 rounded-[10px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive-text">
          {errorMessage}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex items-center rounded-lg bg-brand px-6 py-3 text-sm font-bold text-white transition hover:bg-brand/90 disabled:opacity-60"
        >
          {status === "sending" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {status === "sending" ? "Scoring…" : "Get my estimate"}
        </button>
        <p className="max-w-[440px] text-xs leading-relaxed text-muted-foreground">
          Your answers go to the model and are not saved anywhere. This check is an educational estimate,
          not a diagnosis.
        </p>
      </div>
    </form>
  )
}
