import Link from "next/link"
import { Shield, Brain, Stethoscope, HeartPulse, Activity, Sparkles, ArrowRight, Clock } from "lucide-react"

export default function AboutPage() {
  const departments = [
    { name: "Endocrinology", desc: "The live model: diabetes risk prediction (LightGBM, CDC BRFSS 2015) with a SHAP explanation stored per prediction.", icon: Activity, count: "Live" },
    { name: "Cardiology", desc: "Heart disease risk modelling is on the roadmap — no trained model yet, and the product says so wherever it appears.", icon: HeartPulse, count: "Roadmap" },
    { name: "Nephrology", desc: "Chronic kidney disease modelling is on the roadmap; eGFR staging is already computed as a clinical indicator.", icon: Stethoscope, count: "Roadmap" },
    { name: "Clinical AI MLOps", desc: "Model registry, PSI drift status and retraining — the operational side of the one live model.", icon: Brain, count: "Live" },
  ]

  const metrics = [
    { value: "0.8307", label: "Diabetes model AUC-ROC (held-out test split)" },
    { value: "21", label: "BRFSS health indicators per assessment" },
    { value: "1", label: "Trained model — diabetes (LightGBM)" },
    { value: "SHAP", label: "Explanations stored per prediction" },
  ]

  return (
    <div className="space-y-10 max-w-6xl mx-auto pb-10">
      {/* Novena-inspired Hero Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-primary p-8 sm:p-12 text-white shadow-card">
        <div className="relative z-10 max-w-2xl space-y-4">
          <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8FC3DC]">
            <Sparkles className="h-3.5 w-3.5" /> Healthcare & Decision Support
          </p>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Clinical AI that shows its reasons
          </h1>
          <p className="text-sm sm:text-base text-white/75 leading-relaxed">
            WhyRisk bridges the gap between traditional clinical care and predictive machine learning, giving doctors diabetes risk screening and risk insights they can inspect — not just trust.
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <Link href="/patients/new" className="inline-flex items-center justify-center rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">
              New Patient Risk Assessment <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link href="/doctors" className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              Doctor Directory
            </Link>
          </div>
        </div>
        <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
          <Brain className="w-96 h-96 text-white" />
        </div>
      </div>

      {/* Feature & Working Hours Cards (Inspired by Novena Novena-block) */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
              <Stethoscope className="h-6 w-6" />
            </div>
            <span className="text-xs uppercase tracking-wider font-semibold text-primary">Explainable AI</span>
            <h3 className="text-lg font-bold mt-1">Predictive Risk Assessment</h3>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Instant diabetes risk calculation powered by a trained ML model (LightGBM, CDC BRFSS 2015), plus a rule-based symptom screening wizard for triage. Models for further conditions are on the roadmap.
            </p>
          </div>
          <Link href="/patients/new" className="text-xs font-semibold text-primary hover:underline mt-4 inline-flex items-center">
            Run Assessment <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2E7FA8]/10 text-[#2E7FA8] mb-4">
              <Clock className="h-6 w-6" />
            </div>
            <span className="text-xs uppercase tracking-wider font-semibold text-[#2E7FA8]">Service Facts</span>
            <h3 className="text-lg font-bold mt-1">Clinical AI Service</h3>
            <ul className="text-xs space-y-2 text-muted-foreground mt-3">
              <li className="flex justify-between border-b pb-1"><span>Trained model:</span> <span className="font-semibold text-foreground">Diabetes (LightGBM)</span></li>
              <li className="flex justify-between border-b pb-1"><span>Explanations:</span> <span className="font-semibold text-foreground">SHAP, stored per prediction</span></li>
              <li className="flex justify-between"><span>Other conditions:</span> <span className="font-semibold text-foreground">Roadmap — not trained</span></li>
            </ul>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E2F0E6] text-[#1E7A46] mb-4">
              <Shield className="h-6 w-6" />
            </div>
            <span className="text-xs uppercase tracking-wider font-semibold text-[#1E7A46]">Alerts</span>
            <h3 className="text-lg font-bold mt-1">Critical-Risk Alerts</h3>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              When a prediction is stored with Critical severity, a database trigger fires the alert pipeline and the case appears in the Alerts Center for review.
            </p>
          </div>
          <Link href="/alerts" className="text-xs font-semibold text-[#1E7A46] hover:underline mt-4 inline-flex items-center">
            View Alerts Center <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="rounded-xl border bg-card p-8 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {metrics.map((m, i) => (
            <div key={i} className="space-y-1">
              <div className="text-2xl sm:text-4xl font-extrabold text-primary">{m.value}</div>
              <div className="text-xs text-muted-foreground font-medium">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Departments Grid (Novena Specialization section) */}
      <div className="space-y-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight">Clinical Departments & AI Specialties</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Bridging specialized clinical departments with one documented machine learning decision support model.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {departments.map((dept, idx) => (
            <div key={idx} className="rounded-xl border bg-card p-5 shadow-sm hover:border-primary/50 transition">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                  <dept.icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{dept.count}</span>
              </div>
              <h3 className="font-bold text-base">{dept.name}</h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{dept.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
