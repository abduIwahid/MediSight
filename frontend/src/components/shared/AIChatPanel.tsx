"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Bot, Send, User, AlertTriangle, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { PatientRow } from "@/lib/types"

interface ModelStatusInfo {
  status?: string
  model_name?: string
  version?: string
  metrics?: { auc_roc: number; f1_score: number; accuracy: number }
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  /** True when this reply came from the built-in template fallback
   *  because the AI service was unavailable — rendered with a visible
   *  label so it is never mistaken for a live AI answer. */
  fallback?: boolean
}

interface AIChatPanelProps {
  patientId?: string | null
}

const SUGGESTED_PROMPTS = [
  "Summarize this patient's risk in one paragraph.",
  "What changed since their last visit?",
  "Which lab values are driving this prediction?",
  "Draft a discharge risk summary."
]

async function fetchPatientContext(patientId: string, supabase: SupabaseClient): Promise<PatientRow | null> {
  const { data } = await supabase
    .from("patients")
    .select(`
      mrn, demographics,
      predictions(id, probability, severity, disease, confidence, created_at),
      vitals(type, value, unit, recorded_at),
      lab_results(test_name, value, unit, recorded_at),
      diagnoses(condition, diagnosed_at)
    `)
    .eq("id", patientId)
    .single()
  return (data as unknown as PatientRow | null) ?? null
}

function buildPatientSummary(patient: PatientRow | null): string {
  if (!patient) return ""
  const d = patient.demographics || {}
  const first = d.first_name || d.firstName || d.full_name?.split(" ")[0] || ""
  const last = d.last_name || d.lastName || d.full_name?.split(" ").slice(1).join(" ") || ""
  const name = `${first} ${last}`.trim() || "Unknown"
  const age = d.age ? `${d.age} years old` : ""
  const gender = d.gender || ""
  const preds = (patient.predictions || []).sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const latest = preds[0]
  const vitals = (patient.vitals || [])
    .slice(0, 6)
    .map((v) => `${v.type}: ${v.value}${v.unit ? " " + v.unit : ""}`)
    .join(", ")
  const labs = (patient.lab_results || [])
    .slice(0, 5)
    .map((l) => `${l.test_name}: ${l.value}${l.unit ? " " + l.unit : ""}`)
    .join(", ")
  const diagnoses = (patient.diagnoses || [])
    .map((dx) => dx.condition)
    .join(", ")

  let ctx = `Patient: ${name}${age ? `, ${age}` : ""}${gender ? `, ${gender}` : ""}. MRN: ${patient.mrn}.`
  if (latest) {
    ctx += ` Latest risk assessment: **${latest.severity}** severity — ${((latest.probability ?? 0) * 100).toFixed(1)}% diabetes probability`
    if (latest.confidence) ctx += ` (confidence: ${(latest.confidence * 100).toFixed(0)}%)`
    ctx += `. Disease: ${latest.disease || "Diabetes"}.`
  } else {
    ctx += " No risk prediction has been run yet."
  }
  if (preds.length > 1) ctx += ` ${preds.length} historical predictions on record.`
  if (diagnoses) ctx += ` Known conditions: ${diagnoses}.`
  if (vitals) ctx += ` Recent vitals — ${vitals}.`
  if (labs) ctx += ` Recent labs — ${labs}.`
  return ctx
}

function buildContextMessage(patient: PatientRow): string {
  if (!patient) return ""
  const d = patient.demographics || {}
  const first = d.first_name || d.firstName || d.full_name?.split(" ")[0] || ""
  const last = d.last_name || d.lastName || d.full_name?.split(" ").slice(1).join(" ") || ""
  const name = `${first} ${last}`.trim() || "Unknown Patient"

  const preds = (patient.predictions || []).sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const latest = preds[0]
  const vitals = patient.vitals || []
  const labs = patient.lab_results || []

  let msg = `**Patient Context Loaded: ${name}** (MRN: ${patient.mrn})\n\n`

  if (latest) {
    const prob = ((latest.probability ?? 0) * 100).toFixed(1)
    const sev = latest.severity
    msg += `**Risk Status:** ${sev} — ${prob}% Diabetes Probability\n`
    if (latest.confidence) msg += `**Model Confidence:** ${(latest.confidence * 100).toFixed(0)}%\n`
    msg += `**Disease Target:** ${latest.disease || "Diabetes"}\n`
    if (preds.length > 1) msg += `**Historical Predictions:** ${preds.length} assessments on record\n`
  } else {
    msg += `**No prediction has been run for this patient yet.**\n`
    msg += `Navigate to the patient's detail page and click "Run AI Prediction" to generate a risk assessment.\n`
  }

  msg += `\n`
  if (vitals.length > 0) {
    // The header counts what is actually listed below it (QA Round 1,
    // item 80): "showing 4 of N" when there are more than four.
    msg += `**Recent Vitals (showing ${Math.min(4, vitals.length)} of ${vitals.length}):**\n`
    vitals.slice(0, 4).forEach((v) => {
      msg += `• ${v.type}: ${v.value}${v.unit ? " " + v.unit : ""}\n`
    })
  }
  if (labs.length > 0) {
    msg += `\n**Lab Results (showing ${Math.min(4, labs.length)} of ${labs.length}):**\n`
    labs.slice(0, 4).forEach((l) => {
      msg += `• ${l.test_name}: ${l.value}${l.unit ? " " + l.unit : ""}\n`
    })
  }

  msg += `\nAsk me anything about ${name}'s risk, clinical drivers, or request a discharge summary.`
  return msg
}

function generateLocalResponse(message: string, patientContext: string, modelStatus: ModelStatusInfo | null): string {
  const q = message.toLowerCase()

  if (patientContext) {
    if (q.includes("risk") || q.includes("summarize") || q.includes("summary") || q.includes("paragraph")) {
      return `**Clinical Risk Summary**\n\n${patientContext}\n\n---\nBased on the patient's structured clinical data, the risk assessment reflects the 21 features evaluated by the WhyRisk LightGBM model. Please verify these findings against the full clinical chart before making decisions.`
    }
    if (q.includes("lab") || q.includes("driving") || q.includes("factor") || q.includes("which")) {
      return `**Key Risk Drivers**\n\nThe WhyRisk model evaluates 21 clinical features:\n• **Biometric:** BMI, systolic BP, cholesterol status\n• **Lifestyle:** Physical activity, smoking history, diet, alcohol\n• **Medical history:** Stroke, heart disease, mobility difficulty\n• **Socioeconomic:** Income, education, healthcare access\n\n${patientContext}\n\n---\nFor a detailed SHAP waterfall chart, navigate to the patient's prediction detail page.`
    }
    if (q.includes("discharge") || q.includes("draft")) {
      return `**Discharge Risk Summary (AI Draft)**\n\n${patientContext}\n\n**Next steps to confirm with the treating team:**\n• Review the discharge plan with the treating physician before it is finalised\n• Arrange follow-up and any further tests according to your facility's protocol for this risk band\n• Make sure the patient understands their follow-up plan before they leave\n\n---\nNote: This is an AI-generated draft — review and edit before official use.`
    }
    if (q.includes("change") || q.includes("last visit") || q.includes("since") || q.includes("trend")) {
      return `**Trend Analysis**\n\n${patientContext}\n\nComparing historical predictions shows the trajectory of risk over time. If risk has increased since the last visit, consider re-evaluating:\n• Medication adherence\n• Weight and BMI changes\n• Blood pressure management\n• Physical activity levels\n\n---\nFull trend data is visible in the Prediction History on the patient detail page.`
    }
    return `**Patient Insights**\n\n${patientContext}\n\nI can help with:\n• Risk summaries and severity explanations\n• Key clinical drivers (ask "which factors are driving the prediction?")\n• Discharge planning (ask "draft a discharge summary")\n• Trend analysis (ask "what changed since their last visit?")`
  }

  // General queries (no patient selected)
  if (q.includes("model") || q.includes("accuracy") || q.includes("performance")) {
    const metrics = modelStatus?.metrics
    if (metrics) {
      return `**Model Performance**\n\n• **AUC-ROC:** ${(metrics.auc_roc * 100).toFixed(1)}%\n• **F1 Score:** ${(metrics.f1_score * 100).toFixed(1)}%\n• **Accuracy:** ${(metrics.accuracy * 100).toFixed(1)}%\n• **Model:** ${modelStatus.model_name || "LightGBM"}\n• **Version:** ${modelStatus.version || "1.0.0"}\n\nTrained on the CDC BRFSS 2015 Diabetes Health Indicators dataset (253,680 survey responses).`
    }
    return `**Model Performance**\n\nThe WhyRisk ML engine (LightGBM) achieves AUC-ROC > 0.83 on the held-out test set.\nLive metrics from the FastAPI inference service are shown here whenever the service is connected.`
  }
  if (q.includes("diabetes") || q.includes("disease") || q.includes("predict")) {
    return `**About WhyRisk Prediction**\n\nWhyRisk detects early-stage Diabetes risk using 21 clinical & lifestyle features:\n\n• **Biometric:** BMI, blood pressure, cholesterol\n• **Lifestyle:** Physical activity, smoking, diet, alcohol\n• **History:** Stroke, heart disease, difficulty walking\n• **Socioeconomic:** Income, education, healthcare access\n\n**Risk Classification:**\nLow risk: (< 20%) · Moderate risk: (20–50%) · High risk: (50–80%) · Critical risk: (> 80%)\n\nSelect a patient from the dropdown above to get patient-specific insights.`
  }
  if (q.includes("help") || q.includes("what can") || q.includes("feature")) {
    return `**How I Can Help**\n\n1. **Patient risk summaries** — Select a patient and ask me to summarize their risk\n2. **Risk driver analysis** — Find out which clinical factors are influencing the prediction\n3. **Discharge drafts** — Generate a draft risk summary for discharge planning\n4. **Trend analysis** — Understand how a patient's risk has changed over time\n5. **Model performance** — Ask about the model's accuracy and metrics\n\nSelect a patient from the dropdown above to get started!`
  }
  if (q.includes("high risk") || q.includes("critical") || q.includes("alert")) {
    // General guidance only. The previous canned answer listed specific
    // clinical orders (named lab panels, a fixed follow-up interval)
    // with no source — removed in QA Round 1, item 87.
    return `**High and Critical risk — general guidance**\n\nFor patients flagged as **High** or **Critical** risk:\n\n1. Notify the treating physician promptly\n2. Follow your facility's escalation protocol for high-risk results\n3. Review the factors behind the score on the patient's prediction detail page\n4. Arrange follow-up and any further assessment as the treating team decides\n\nCheck the **Alerts Center** in the sidebar for active risk alerts across your patient panel.`
  }

  return `**I'm the WhyRisk AI Assistant**, your clinical decision support assistant.\n\nI can answer questions about:\n• Patient risk summaries and clinical factors\n• Model performance and predictions\n• High-risk protocols and clinical guidance\n\nTo get patient-specific insights: **Select a patient from the dropdown above**, then ask about their risk, lab drivers, or request a discharge summary.\n\nWhat would you like to know?`
}

export function AIChatPanel({ patientId }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "**I'm the WhyRisk AI Assistant**, your clinical decision support assistant.\n\nSelect a patient from the dropdown above to load their clinical context, or ask me a general question about risk protocols, model performance, and clinical guidance."
    }
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingContext, setIsLoadingContext] = useState(false)
  const [contextStatus, setContextStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Auto-load patient context when a patient is selected
  useEffect(() => {
    if (!patientId) {
      setContextStatus("idle")
      return
    }

    setIsLoadingContext(true)
    setContextStatus("loading")
    fetchPatientContext(patientId, supabase)
      .then((patient) => {
        if (patient) {
          setContextStatus("loaded")
          const contextMsg = buildContextMessage(patient)
          setMessages([
            {
              id: "welcome",
              role: "assistant",
              content: contextMsg
            }
          ])
        } else {
          // A failed load must not claim "context loaded" in the header,
          // and must not wipe an ongoing conversation — the header shows
          // the honest error state and the chat continues without
          // patient context.
          setContextStatus("error")
        }
      })
      .catch(() => {
        setContextStatus("error")
      })
      .finally(() => setIsLoadingContext(false))
  }, [patientId]) // eslint-disable-line

  const handleSend = async (text: string) => {
    if (!text.trim()) return

    const userMessage: Message = { id: Date.now().toString(), role: "user", content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const [patientData, modelStatusRes] = await Promise.all([
        patientId ? fetchPatientContext(patientId, supabase) : Promise.resolve(null),
        fetch("/api/ml/model-status").then(r => r.ok ? r.json() : null).catch(() => null)
      ])

      const patientContext = buildPatientSummary(patientData)

      // Try the real AI (Gemini) first. Send recent chat history for conversational context.
      let reply: string | null = null
      try {
        const recentHistory = messages.slice(-8).map(m => ({ role: m.role, content: m.content }))
        const aiRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, patientContext, history: recentHistory, mode: "doctor" }),
        })
        if (aiRes.ok) {
          const data = await aiRes.json()
          reply = data.reply
        }
      } catch {
        // Network/AI failure — fall through to local response below
      }

      // Fallback: rule-based response if Gemini isn't configured or the
      // call failed. It is flagged so the UI labels it as a built-in
      // template response — it must never pass as a live AI answer.
      let usedFallback = false
      if (!reply) {
        reply = generateLocalResponse(text, patientContext, modelStatusRes)
        usedFallback = true
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: reply,
        fallback: usedFallback,
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: unknown) {
      console.error("Chat send failed:", error)
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: "Something went wrong while generating a response. Please check your connection and try again."
      }])
    } finally {
      setIsLoading(false)
    }
  }

  // Render message content with basic markdown-like bold support
  const renderContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      // Bold: **text**
      const parts = line.split(/\*\*(.+?)\*\*/g)
      return (
        <span key={i}>
          {parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
          )}
          <br />
        </span>
      )
    })
  }

  return (
    <Card className="flex flex-col h-[calc(100dvh-12rem)] border shadow-sm">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle>AI Assistant</CardTitle>
          {isLoadingContext && (
            <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading patient data...
            </div>
          )}
        </div>
        <CardDescription>
          {!patientId
            ? "Select a patient above for patient-specific answers, or ask general clinical questions."
            : contextStatus === "loaded"
              ? "Patient context loaded. Ask about risk, clinical drivers, or request a discharge summary."
              : contextStatus === "error"
                ? "Patient context could not be loaded — answers will be general, with no patient data."
                : "Loading patient context..."}
        </CardDescription>
        {patientId && contextStatus === "error" && (
          <p role="alert" className="mt-2 rounded-lg border border-[#D97706]/30 bg-[#FDF0DC] px-3 py-2 text-xs text-[#A85008]">
            Could not load this patient&apos;s data. Please check your connection and re-select the patient to try again.
          </p>
        )}
      </CardHeader>

      <CardContent role="log" aria-live="polite" className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 max-w-[88%] ${
              msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
            }`}
          >
            <div className={`flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full ${
              msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}>
              {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div
              className={`px-4 py-3 rounded-xl text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {msg.fallback && (
                <span className="mb-2 inline-block rounded-full border border-[#D97706]/30 bg-[#FDF0DC] px-2 py-0.5 text-[11px] font-semibold text-[#A85008]">
                  Built-in template response — the AI service is unavailable
                </span>
              )}
              {renderContent(msg.content)}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 max-w-[80%] mr-auto">
            <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-secondary text-secondary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <div className="px-4 py-3 rounded-xl bg-muted flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Analyzing clinical data...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </CardContent>

      {patientId && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-2 mb-1">
            {SUGGESTED_PROMPTS.map((prompt, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="text-xs rounded-full h-7"
                onClick={() => handleSend(prompt)}
                disabled={isLoading || isLoadingContext}
              >
                {prompt}
              </Button>
            ))}
          </div>
        </div>
      )}

      <CardFooter className="border-t p-4 flex flex-col gap-3">
        <form
          className="flex w-full items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            handleSend(input)
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={patientId ? "Ask about this patient's risk, labs, or request a discharge summary..." : "Ask a general clinical question..."}
            disabled={isLoading || isLoadingContext}
            className="flex-1"
            aria-label="Message"
          />
          <Button type="submit" size="icon" aria-label="Send message" disabled={!input.trim() || isLoading || isLoadingContext}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground w-full">
          <AlertTriangle className="h-3.5 w-3.5 text-[#A85008]" />
          <span>AI-generated insights. Please verify with clinical judgment.</span>
        </div>
        <p className="w-full text-center text-xs text-muted-foreground">
          When a patient is selected, their loaded context is sent to Google Gemini to generate answers. Verify all responses clinically before use.
        </p>
      </CardFooter>
    </Card>
  )
}
