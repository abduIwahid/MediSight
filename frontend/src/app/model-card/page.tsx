import Link from "next/link"
import BrandMark from "@/components/shared/BrandMark"
import { ModelCardLiveStatus } from "@/components/shared/ModelCardLiveStatus"
import { severityPillClass } from "@/lib/status"

const FACTS: { label: string; value: string; note: string }[] = [
  {
    label: "Dataset",
    value: "CDC BRFSS 2015",
    note: "Behavioural Risk Factor Surveillance System survey data — the balanced 50/50 training file of 70,692 records, 21 input features per record.",
  },
  {
    label: "Selected model",
    value: "LightGBM",
    note: "Gradient-boosted decision trees, chosen after comparing candidate models on the same data split.",
  },
  {
    label: "Measured performance",
    value: "AUC-ROC 0.8222",
    note: "Measured on a stratified held-out test split (80/20) of the balanced dataset that the model never trained on. Because the test split is balanced (50/50), this figure is not directly comparable to performance on a real-world population. Diabetes prediction only — this figure does not describe any other condition.",
  },
  {
    label: "Explanations",
    value: "SHAP",
    note: "Predictions ship with SHAP feature attributions, so the factors behind a score can be inspected instead of trusted blindly.",
  },
]

export default function ModelCardPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <BrandMark className="h-9 w-9 shrink-0" />
            <span className="text-lg font-bold tracking-tight">WhyRisk</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium">
            <Link href="/login" className="text-muted-foreground transition hover:text-foreground">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-4xl px-5 py-12">
        <p className="eyebrow">Model card</p>
        <h1 className="mt-2 font-sans text-4xl font-bold leading-tight sm:text-5xl">
          One trained model.
          <br />
          Documented honestly.
        </h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
          This page states exactly what WhyRisk&apos;s model is, what data it was trained and measured on, and
          what it does not do. Figures here come from the project documentation and the held-out evaluation —
          nothing on this page is estimated or rounded up.
        </p>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          {FACTS.map((fact) => (
            <div key={fact.label} className="rounded-xl border bg-card p-5 shadow-card">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{fact.label}</p>
              <p className="mt-2 font-sans text-2xl font-bold tracking-normal">{fact.value}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{fact.note}</p>
            </div>
          ))}
        </section>

        <ModelCardLiveStatus />

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">What is real today</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>One trained model: diabetes risk prediction from the 21 BRFSS health indicators.</li>
              <li>SHAP explanations are stored per prediction.</li>
              <li>A separate symptom checker that is a rule-based heuristic — not a trained model, and labelled as such in the product.</li>
            </ul>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Roadmap — not trained models</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>Heart disease, stroke, chronic kidney disease, hypertension, asthma and COPD are planned future models.</li>
              <li>They are listed so the scope is transparent: today, WhyRisk predicts diabetes risk only.</li>
            </ul>
          </div>
        </section>

        <section className="mt-4 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">How scores are banded</h2>
          <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            Every score is placed in one of four severity bands — the same bands used everywhere in the app:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${severityPillClass.Low}`}>Low — under 0.20</span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${severityPillClass.Moderate}`}>Moderate — 0.20 to 0.49</span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${severityPillClass.High}`}>High — 0.50 to 0.79</span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${severityPillClass.Critical}`}>Critical — 0.80 and above</span>
          </div>
        </section>

        <section className="mt-4 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Limitations</h2>
          <ul className="mt-3 max-w-[70ch] list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>The model was trained on United States survey data (BRFSS 2015); performance on other populations has not been validated.</li>
            <li>A score is a screening estimate, not a diagnosis. False positives and false negatives occur.</li>
            <li>WhyRisk is an experimental clinical decision-support and research tool. It is not a certified medical device and does not replace professional diagnosis.</li>
          </ul>
        </section>
      </main>

      <footer className="bg-foreground py-8 text-[#C8D6DA]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3.5 px-5">
          <span className="flex items-center gap-2.5">
            <BrandMark className="h-9 w-9 shrink-0" />
            <span className="text-lg font-bold tracking-tight text-white">WhyRisk</span>
          </span>
          <span className="flex items-center gap-5 text-sm font-medium">
            <Link href="/login" className="text-white underline decoration-[#2E7FA8] decoration-2 underline-offset-4 hover:opacity-80">
              Sign in
            </Link>
            <Link href="/signup" className="text-white underline decoration-[#2E7FA8] decoration-2 underline-offset-4 hover:opacity-80">
              Create account
            </Link>
          </span>
          <p className="max-w-[640px] text-xs leading-relaxed opacity-75">
            WhyRisk is an experimental clinical decision-support and research tool. It is not a certified medical
            device and does not replace professional diagnosis. Built during a machine-learning internship at Ezitech
            Institute, Islamabad.
          </p>
        </div>
      </footer>
    </div>
  )
}
