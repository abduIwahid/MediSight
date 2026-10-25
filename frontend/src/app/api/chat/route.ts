import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const GEMINI_MODEL = "gemini-flash-latest"
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const DOCTOR_SYSTEM_INSTRUCTION = `You are WhyRisk, a clinical decision-support assistant embedded in a hospital dashboard used by doctors.

Rules you must always follow:
- You support licensed clinicians; you do not replace their judgment. Never state a diagnosis as fact — frame findings as "risk indicators" or "worth reviewing".
- Ground every answer in the patient context provided to you. If no patient is selected, answer generally and invite the doctor to select a patient for specifics.
- Be concise, use clinical language a doctor would expect, and use markdown-style **bold** for key terms and short bullet lists where helpful.
- You may discuss differential diagnoses, explain disease-prediction/model output, and support clinical decision-making — this assistant is only ever shown to authenticated doctors.
- If asked something outside clinical/administrative scope of this platform, politely redirect back to what you can help with.
- Never fabricate lab values, vitals, or history that were not given to you in the context.`

const PATIENT_SYSTEM_INSTRUCTION = `You are the WhyRisk Patient Assistant, a friendly triage and booking helper for patients using a hospital's patient portal.

Rules you must always follow:
- You are talking directly to a patient, not a clinician. Ask about their symptoms conversationally, one or two questions at a time, to understand what's going on.
- Based on what they describe, suggest which type of specialist would be most appropriate (e.g. cardiologist, dermatologist, endocrinologist, general physician) and encourage them to book an appointment through the portal's "Book Appointment" page.
- You must NEVER diagnose a disease, state a probability of having a condition, interpret lab/vitals data, or offer clinical assessments — that is exclusively a doctor's job, done through the clinical dashboard. If the patient asks you to diagnose them or predict a disease, politely decline and explain a doctor needs to do that.
- Give general, cautious health/wellness guidance only (hydration, rest, when to seek urgent care, over-the-counter comfort measures), never specific dosing or prescription advice.
- If symptoms sound urgent or severe (e.g. chest pain, difficulty breathing, stroke symptoms, severe bleeding), tell them clearly to seek emergency care immediately (call local emergency services), before anything else.
- Always make clear, near the end of substantive answers, that you do not replace professional medical advice and a doctor should confirm anything important.
- Be warm, plain-spoken, and brief. Use markdown-style **bold** sparingly for key points.`

// Input caps — the chat panels are the only legitimate callers and stay
// far below these; anything larger is abuse or a bug, and is truncated
// rather than forwarded to the model at full size.
const MAX_MESSAGE_CHARS = 2000
const MAX_CONTEXT_CHARS = 8000
const MAX_HISTORY_ITEMS = 10
const MAX_HISTORY_ITEM_CHARS = 2000

export async function POST(request: Request) {
  try {
    // Authenticated users only — this route spends real Gemini quota and
    // its doctor mode is a clinical tool. Middleware gates pages, not this
    // route, so the check lives here.
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Not signed in.", fallback: true }, { status: 401 })
    }

    // The instruction set follows the CALLER's actual role, never a
    // client-supplied flag: a patient must not be able to invoke doctor
    // mode (or attach a fabricated "patient context") by editing the
    // request body. Missing profile → least-privilege patient mode.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    // A doctor whose application is pending or rejected does NOT get
    // the clinical assistant: /api/predict and /api/explain refuse the
    // same accounts with this exact 403, and deriving doctor mode from
    // the profile role alone left this route as the one door still
    // open to unapproved doctors (QA Round 2, cluster 13).
    if (profile?.role === "doctor") {
      const { data: doctor } = await supabase
        .from("doctors")
        .select("status")
        .eq("user_id", user.id)
        .single()
      if (doctor?.status !== "approved") {
        return NextResponse.json(
          { error: "Doctor account is not approved yet.", fallback: true },
          { status: 403 }
        )
      }
    }

    const isPatient = !profile || profile.role === "patient"
    const SYSTEM_INSTRUCTION = isPatient ? PATIENT_SYSTEM_INSTRUCTION : DOCTOR_SYSTEM_INSTRUCTION

    const body = await request.json().catch(() => null)
    const rawMessage = body?.message
    const rawContext = typeof body?.patientContext === "string" ? body.patientContext : ""
    const rawHistory = Array.isArray(body?.history) ? body.history : []

    if (!rawMessage || typeof rawMessage !== "string") {
      return NextResponse.json({ error: "Missing 'message' in request body." }, { status: 400 })
    }

    const message = rawMessage.slice(0, MAX_MESSAGE_CHARS)
    const patientContext = isPatient ? "" : rawContext.slice(0, MAX_CONTEXT_CHARS)
    const history = rawHistory
      .filter(
        (m: { role?: unknown; content?: unknown }) =>
          (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string"
      )
      .slice(-MAX_HISTORY_ITEMS)
      .map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content.slice(0, MAX_HISTORY_ITEM_CHARS),
      }))

    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      // Deliberately generic: configuration details are server business,
      // and the panels key their honest "template mode" label off
      // `fallback: true`, not off this string.
      return NextResponse.json(
        { error: "The AI assistant is unavailable right now.", fallback: true },
        { status: 503 }
      )
    }

    const contents = [
      ...history.map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      {
        role: "user",
        parts: [
          {
            text: patientContext
              ? `Patient context:\n${patientContext}\n\nDoctor's question: ${message}`
              : message,
          },
        ],
      },
    ]

    const geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 800,
        },
      }),
    })

    if (!geminiResponse.ok) {
      // Upstream error bodies can contain provider internals — log the
      // status server-side, return a generic message to the client.
      console.error(`[api/chat] Gemini responded with ${geminiResponse.status}.`)
      return NextResponse.json(
        { error: "The AI assistant could not respond. Please try again.", fallback: true },
        { status: 502 }
      )
    }

    const data = await geminiResponse.json()
    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ||
      "I couldn't generate a response for that. Could you rephrase your question?"

    return NextResponse.json({ reply })
  } catch (error: unknown) {
    console.error("[api/chat] Unexpected error:", error)
    return NextResponse.json(
      { error: "The AI assistant could not respond. Please try again.", fallback: true },
      { status: 500 }
    )
  }
}
