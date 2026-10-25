import Link from "next/link"
import type { CSSProperties } from "react"
import type { Metadata } from "next"
import { Activity, ArrowRight, CalendarCheck, ListChecks } from "lucide-react"
import BrandMark from "@/components/shared/BrandMark"

export const metadata: Metadata = {
  // Absolute title: the root template would otherwise append "— WhyRisk"
  // to a title that already starts with the brand name.
  title: { absolute: "WhyRisk — Know your risk. See exactly why." },
  description:
    "WhyRisk estimates diabetes risk with a trained machine-learning model and shows the reasons behind the score — SHAP explanations, stored per prediction.",
  alternates: { canonical: "/welcome" },
  openGraph: {
    url: "/welcome",
    title: "WhyRisk — Know your risk. See exactly why.",
    description:
      "Diabetes risk prediction with explainable machine learning — every score shows its reasons.",
  },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "WhyRisk",
  applicationCategory: "HealthApplication",
  operatingSystem: "Web",
  url: "https://whyrisk.vercel.app/welcome",
  description:
    "Diabetes risk prediction with explainable machine learning — every score shows its reasons.",
}

/* ------------------------------------------------------------------ */
/*  WhyRisk public landing page.                                     */
/*  Every number on this page is a verified project fact (see the      */
/*  README): one trained diabetes model, its held-out AUC-ROC, the     */
/*  BRFSS 2015 dataset, and a SHAP explanation stored per prediction. */
/*  Nothing else is claimed.                                           */
/* ------------------------------------------------------------------ */

const FACTS = [
  {
    value: "0.8307",
    text: "AUC-ROC of the diabetes model on a held-out test split — the only accuracy figure we claim",
  },
  {
    value: "1",
    text: "Trained model in production. Six more conditions are on the roadmap, labelled as such",
  },
  {
    value: "21",
    text: "Health indicators per assessment, from the CDC BRFSS 2015 dataset (253,680 records)",
  },
  {
    value: "SHAP",
    text: "Predictions ship with a SHAP explanation — each score shows the factors behind it",
  },
]

const CAPABILITIES = [
  {
    icon: Activity,
    title: "Risk prediction",
    text: "A LightGBM model trained on CDC survey data estimates diabetes risk from 21 everyday health indicators — no lab visit needed for a first screening.",
  },
  {
    icon: ListChecks,
    title: "The reason, not just the score",
    text: "Every result lists the factors that pushed the score up or down, with their weights. A doctor can argue with it — that is the point.",
  },
  {
    icon: CalendarCheck,
    title: "Records & appointments",
    text: "Patient and doctor portals with role-based access, appointment booking and an admin overview — protected by row-level security.",
  },
]

const DEMO_FACTORS = [
  { label: "BMI 29.4", width: "62%", color: "#D97706", value: "+0.14" },
  { label: "High blood pressure", width: "48%", color: "#D97706", value: "+0.10" },
  { label: "High cholesterol", width: "38%", color: "#2E7FA8", value: "+0.08" },
  { label: "Physically active", width: "30%", color: "#1E7A46", value: "−0.06" },
]

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95">
        <div className="mx-auto flex max-w-6xl items-center gap-3.5 px-5 py-3.5">
          <Link href="/welcome" className="flex items-center gap-3">
            <BrandMark className="h-[38px] w-[38px] shrink-0 drop-shadow-sm" />
            <span className="font-display text-[21px] uppercase leading-none tracking-wide">
              WhyRisk
              <span className="mt-1 block font-mono text-[9.5px] font-medium uppercase tracking-[2px] text-brand-text">
                Risk, explained
              </span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-6 text-sm font-semibold md:flex">
            <Link href="/model-card" className="text-foreground/75 transition hover:text-foreground">The model</Link>
            <a href="#how" className="text-foreground/75 transition hover:text-foreground">How it works</a>
            <a href="#scope" className="text-foreground/75 transition hover:text-foreground">Scope</a>
            <Link href="/login" className="text-foreground/75 transition hover:text-foreground">Sign in</Link>
          </nav>
          <Link
            href="/signup"
            className="ml-4 inline-flex items-center rounded-lg border-[1.5px] border-primary px-5 py-2.5 text-sm font-bold text-primary transition hover:bg-secondary md:ml-6"
          >
            Create your account
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5">
        {/* Hero */}
        <section className="grid items-start gap-10 pb-8 pt-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="eyebrow reveal" style={{ "--d": "0ms" } as CSSProperties}>
              Explainable healthcare ML
            </p>
            <h1
              className="reveal mt-4 font-display text-[clamp(42px,7.5vw,76px)] uppercase leading-[1.02]"
              style={{ "--d": "90ms" } as CSSProperties}
            >
              Know your risk.
              <br />
              <span className="text-brand">See exactly why.</span>
            </h1>
            <p
              className="reveal reveal-slow mt-6 max-w-[620px] text-[17.5px] leading-relaxed text-[#33454F]"
              style={{ "--d": "200ms" } as CSSProperties}
            >
              WhyRisk estimates your diabetes risk with a trained machine-learning model — and shows you the reasons
              behind the score, in plain language. No black box. No invented numbers.
            </p>
            <div className="reveal mt-7 flex flex-wrap gap-3" style={{ "--d": "320ms" } as CSSProperties}>
              <Link
                href="/signup"
                className="inline-flex items-center rounded-lg bg-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-brand/90"
              >
                Create your account <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center rounded-lg border-[1.5px] border-primary px-5 py-3 text-sm font-bold text-primary transition hover:bg-secondary"
              >
                How the model works
              </a>
            </div>
            <div
              className="reveal reveal-slow mt-7 rounded-[10px] border border-[#D97706] bg-[#FDF0DC] px-4 py-3 text-[13.5px] leading-relaxed text-[#6B4A08]"
              style={{ "--d": "430ms" } as CSSProperties}
            >
              <strong>Honest by design:</strong> one trained model today (diabetes). Everything else is clearly marked
              as roadmap — this site never dresses up a guess as a prediction.
            </div>
          </div>

          {/* Hero visual — the explanation is the product */}
          <div
            className="reveal reveal-slow rounded-[14px] border border-border bg-card p-[22px] shadow-premium"
            style={{ "--d": "240ms" } as CSSProperties}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[1.6px] text-muted-foreground">
                Patient · Diabetes risk
              </span>
              <span className="rounded-full bg-[#E2F0E6] px-2.5 py-1 text-[11px] font-bold text-[#1E7A46]">
                Demo data
              </span>
            </div>
            <p className="mt-2 font-sans text-xl font-bold tracking-normal">Ahmed Raza, 47</p>
            <p className="text-[13px] text-muted-foreground">Sample assessment · LightGBM model</p>
            <div className="mt-2 font-display text-[52px] leading-none">
              0.31{" "}
              <small className="font-sans text-sm font-semibold text-muted-foreground">/ 1.00 probability</small>
            </div>
            <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full w-[31%] rounded-full bg-brand" />
            </div>
            <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
              <span>LOW</span>
              <span>MODERATE</span>
              <span>HIGH</span>
            </div>
            <div className="mt-[18px] border-t border-secondary pt-3.5">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[1.6px] text-brand-text">
                Why this score — top factors
              </h3>
              <div className="mt-1">
                {DEMO_FACTORS.map((f) => (
                  <div key={f.label} className="mt-2 flex items-center gap-2.5 text-[13px]">
                    <span className="w-[118px] shrink-0 text-[#33454F]">{f.label}</span>
                    <span className="h-[9px] flex-1 overflow-hidden rounded-full bg-secondary">
                      <span className="block h-full rounded-full" style={{ width: f.width, background: f.color }} />
                    </span>
                    <span className="w-[42px] text-right font-mono text-[11.5px]">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-4 border-t border-secondary pt-3 text-xs leading-relaxed text-muted-foreground">
              Explanation generated with SHAP from the patient&apos;s own inputs. A screening aid — not a diagnosis.
            </p>
          </div>
        </section>

        {/* Honest facts */}
        <section id="model" className="grid scroll-mt-24 gap-3 pb-2 pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.value} className="rounded-xl bg-primary p-[18px] text-white">
              <span className="block font-display text-[26px] tracking-wide">{f.value}</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-white/85">{f.text}</span>
            </div>
          ))}
        </section>

        {/* What it does */}
        <section id="how" className="scroll-mt-24 pb-2 pt-12">
          <h2 className="font-display text-[30px] uppercase tracking-wide">What it does</h2>
          <p className="mt-1.5 max-w-[640px] text-[15.5px] text-muted-foreground">
            Three things, done properly — instead of ten things done with smoke and mirrors.
          </p>
          <div className="mt-[22px] grid gap-3.5 md:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex h-[42px] w-[42px] items-center justify-center rounded-[10px] bg-secondary text-primary">
                  <c.icon className="h-5 w-5" />
                </div>
                <h3 className="font-sans text-[17px] font-bold tracking-normal">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#41525B]">{c.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Honest scope */}
        <section id="scope" className="scroll-mt-24 pb-2 pt-12">
          <h2 className="font-display text-[30px] uppercase tracking-wide">What is real, what is next</h2>
          <p className="mt-1.5 max-w-[640px] text-[15.5px] text-muted-foreground">
            Most health apps hide this page. We put it on the homepage.
          </p>
          <div className="mt-[22px] grid gap-3.5 md:grid-cols-2">
            <div className="rounded-xl border-[1.5px] border-primary bg-card p-5">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-[1.6px] text-[#1E7A46]">Available now</h3>
              <ul className="mt-2 text-[14.5px]">
                {[
                  ["Diabetes risk model (LightGBM)", "Trained", "bg-[#E2F0E6] text-[#1E7A46]"],
                  ["SHAP explanations", "Stored per prediction", "bg-[#E2F0E6] text-[#1E7A46]"],
                  ["Symptom screening", "Rule-based · labelled", "bg-[#FDF0DC] text-[#A85008]"],
                  ["Patient / doctor portals & appointments", "Live", "bg-[#E2F0E6] text-[#1E7A46]"],
                ].map(([label, tag, tagClass]) => (
                  <li key={label} className="flex items-center justify-between gap-2 border-b border-foreground/[0.07] py-[7px] last:border-b-0">
                    <span>{label}</span>
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${tagClass}`}>{tag}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-dashed border-[#9FB3B8] bg-secondary p-5">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-[1.6px] text-muted-foreground">On the roadmap</h3>
              <ul className="mt-2 text-[14.5px]">
                {[
                  "Heart disease model",
                  "Stroke model",
                  "Chronic kidney disease model",
                  "Hypertension model",
                  "Asthma & COPD models",
                ].map((label) => (
                  <li key={label} className="flex items-center justify-between gap-2 border-b border-foreground/[0.07] py-[7px] last:border-b-0">
                    <span>{label}</span>
                    <span className="whitespace-nowrap rounded-full bg-[#DDE5E7] px-2 py-0.5 text-[11px] font-bold text-[#5A6B73]">
                      In development
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Inside the app */}
        <section className="pb-4 pt-12">
          <h2 className="font-display text-[30px] uppercase tracking-wide">Inside the app</h2>
          <p className="mt-1.5 max-w-[640px] text-[15.5px] text-muted-foreground">
            One admin, one login — a live overview of the whole practice.
          </p>
          <div className="mt-[22px] grid overflow-hidden rounded-[14px] border border-border bg-card md:grid-cols-[200px_1fr]">
            <div className="hidden bg-foreground p-5 text-[#DCE7EA] md:block">
              <div className="font-display text-[17px] uppercase tracking-wide text-white">WhyRisk</div>
              <ul className="mt-[18px] space-y-1 text-[13.5px]">
                {["Dashboard", "Risk Queue", "Alerts Center", "AI Assistant", "Model Registry", "Audit Logs"].map((item, i) => (
                  <li key={item} className={i === 0 ? "rounded-lg bg-primary px-2.5 py-[9px] font-bold text-white" : "px-2.5 py-[9px] opacity-80"}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-5">
              <div className="font-mono text-[11px] uppercase tracking-[1.6px] text-muted-foreground">Admin · Overview</div>
              <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {["Total patients (live count)", "Total doctors (live count)", "Pending approvals", "Appointments"].map((label) => (
                  <div key={label} className="rounded-[10px] border border-secondary bg-background p-3.5">
                    <span className="block font-display text-2xl">—</span>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3.5 text-[13px] text-muted-foreground">
                Counts load live from the database — the preview leaves them blank rather than inventing numbers.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-14 bg-foreground py-[30px] text-[#C8D6DA]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3.5 px-5">
          <span className="font-display text-lg uppercase tracking-wide text-white">WhyRisk</span>
          <span className="flex items-center gap-4">
            <Link href="/login" className="text-xs font-semibold text-white underline decoration-[#2E7FA8] decoration-2 underline-offset-4 hover:opacity-80">
              Sign in
            </Link>
            <a href="/model-card" className="text-xs font-semibold text-white underline decoration-[#2E7FA8] decoration-2 underline-offset-4 hover:opacity-80">
              Model card
            </a>
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
