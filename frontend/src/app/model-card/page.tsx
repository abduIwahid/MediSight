"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

interface LiveStatus {
  live: boolean
  modelLoaded?: boolean
  modelName?: string | null
  version?: string | null
  lastTrained?: string | null
  diseases?: string[]
  drift?: {
    available: boolean
    currentPsi: number | null
    driftDetected: boolean
    threshold: number | null
  } | null
}

const FACTS: { label: string; value: string; note: string }[] = [
  {
    label: "Dataset",
    value: "CDC BRFSS 2015",
    note: "Behavioural Risk Factor Surveillance System survey data — 253,680 records, 21 input features per record.",
  },
  {
    label: "Selected model",
    value: "LightGBM",
    note: "Gradient-boosted decision trees, chosen after comparing candidate models on the same data split.",
  },
  {
    label: "Measured performance",
    value: "AUC-ROC 0.8307",
    note: "Measured on a stratified held-out test split (80/20) that the model never trained on. Diabetes prediction only — this figure does not describe any other condition.",
  },
  {
    label: "Explanations",
    value: "SHAP",
    note: "Every prediction ships with SHAP feature attributions, so the factors behind a score can be inspected instead of trusted blindly.",
  },
]

function fmtDate(iso?: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
}

export default function ModelCardPage() {
  const [live, setLive] = useState<LiveStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/ml/model-card")
      .then((res) => res.json())
      .then((data: LiveStatus) => {
        if (!cancelled) setLive(data)
      })
      .catch(() => {
        if (!cancelled) setLive({ live: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <span className="font-display text-xl uppercase tracking-wide">MediSight</span>
          <Link
            href="/welcome"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-12">
        <p className="eyebrow">Model card</p>
        <h1 className="mt-2 font-display text-4xl uppercase leading-tight sm:text-5xl">
          One trained model.
          <br />
          Documented honestly.
        </h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
          This page states exactly what MediSight&apos;s model is, what data it was trained and measured on, and
          what it does not do. Figures here come from the project documentation and the held-out evaluation —
          nothing on this page is estimated or rounded up.
        </p>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          {FACTS.map((fact) => (
            <div key={fact.label} className="rounded-2xl border bg-card p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{fact.label}</p>
              <p className="mt-2 font-display text-2xl tracking-wide">{fact.value}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{fact.note}</p>
            </div>
          ))}
        </section>

        <section className="mt-4 rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Live service status</p>
          {live === null ? (
            <p className="mt-3 text-sm text-muted-foreground">Checking the ML service…</p>
          ) : !live.live ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Live status unavailable — the ML service could not be reached just now. The facts above are from
              the project documentation and stand on their own.
            </p>
          ) : (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-baseline justify-between gap-4 rounded-lg bg-background px-4 py-2.5">
                <dt className="text-muted-foreground">Service</dt>
                <dd className="font-mono font-semibold" style={{ color: live.modelLoaded ? "#1E7A46" : "#C0392B" }}>
                  {live.modelLoaded ? "Model loaded" : "Model not loaded"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 rounded-lg bg-background px-4 py-2.5">
                <dt className="text-muted-foreground">Model</dt>
                <dd className="font-mono font-semibold">
                  {live.modelName || "—"}
                  {live.version ? ` · ${live.version}` : ""}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 rounded-lg bg-background px-4 py-2.5">
                <dt className="text-muted-foreground">Last trained</dt>
                <dd className="font-mono font-semibold">{fmtDate(live.lastTrained)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 rounded-lg bg-background px-4 py-2.5">
                <dt className="text-muted-foreground">Trained conditions served</dt>
                <dd className="font-mono font-semibold">{(live.diseases || []).join(", ") || "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 rounded-lg bg-background px-4 py-2.5 sm:col-span-2">
                <dt className="text-muted-foreground">Data drift (PSI)</dt>
                <dd className="font-mono font-semibold">
                  {!live.drift
                    ? "Status unavailable"
                    : !live.drift.available
                      ? "No drift baseline yet"
                      : live.drift.currentPsi == null
                        ? "—"
                        : `${live.drift.currentPsi.toFixed(3)}${live.drift.threshold != null ? ` (threshold ${live.drift.threshold.toFixed(2)})` : ""} — ${live.drift.driftDetected ? "drift detected" : "no drift detected"}`}
                </dd>
              </div>
            </dl>
          )}
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">What is real today</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>One trained model: diabetes risk prediction from the 21 BRFSS health indicators.</li>
              <li>SHAP explanations stored with every prediction.</li>
              <li>A separate symptom checker that is a rule-based heuristic — not a trained model, and labelled as such in the product.</li>
            </ul>
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Roadmap — not trained models</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>Heart disease, stroke, chronic kidney disease, hypertension, asthma and COPD are planned future models.</li>
              <li>They are listed so the scope is transparent: today, MediSight predicts diabetes risk only.</li>
            </ul>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Limitations</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>The model was trained on United States survey data (BRFSS 2015); performance on other populations has not been validated.</li>
            <li>A score is a screening estimate, not a diagnosis. False positives and false negatives occur.</li>
            <li>MediSight is an experimental clinical decision-support and research tool. It is not a certified medical device and does not replace professional diagnosis.</li>
          </ul>
        </section>
      </main>

      <footer className="bg-foreground py-8 text-[#C8D6DA]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3.5 px-5">
          <span className="font-display text-lg uppercase tracking-wide text-white">MediSight</span>
          <p className="max-w-[640px] text-xs leading-relaxed opacity-75">
            MediSight is an experimental clinical decision-support and research tool. It is not a certified medical
            device and does not replace professional diagnosis. Built during a machine-learning internship at Ezitech
            Institute, Islamabad.
          </p>
        </div>
      </footer>
    </div>
  )
}
