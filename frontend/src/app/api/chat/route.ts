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

const STAFF_SYSTEM_INSTRUCTION = `You are WhyRisk, an internal assistant for hospital staff using the WhyRisk platform.

Rules you must always follow:
- Help with platform questions: how features work, what a screen or status means, and general administrative guidance.
- You are not the clinical assistant: do not interpret patient data, discuss differential diagnoses, or comment on model output — those go through the clinical dashboard assistant available to approved doctors.
- If no patient context is provided, never invent one. If asked about a specific patient, explain that patient-specific clinical questions belong to the patient's doctor.
- Be concise and plain-spoken.`

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

    // The instruction set is chosen by role with least privilege
    // (QA Round 3, api-security M5): the CLINICAL set — which invites
    // attaching arbitrary patient context — belongs to approved
    // doctors only. Other staff roles (nurse, admin, data_scientist)
    // get the staff set with no patient-context channel, mirroring
    // the /api/predict authorization model; patients get the patient
    // set. Previously any non-patient profile received the clinical
    // instructions plus the context slot.
    const isApprovedDoctor = profile?.role === "doctor"
    const isPatient = !profile || profile.role === "patient"
    const SYSTEM_INSTRUCTION = isApprovedDoctor
      ? DOCTOR_SYSTEM_INSTRUCTION
      : isPatient
        ? PATIENT_SYSTEM_INSTRUCTION
        : STAFF_SYSTEM_INSTRUCTION

    const body = await request.json().catch(() => null)
    const rawMessage = body?.message
    const rawContext = typeof body?.patientContext === "string" ? body.patientContext : ""
    const rawHistory = Array.isArray(body?.history) ? body.history : []

    if (!rawMessage || typeof rawMessage !== "string") {
      return NextResponse.json(
        { error: "Please type a message first.", fallback: true },
        { status: 400 }
      )
    }

    const message = rawMessage.slice(0, MAX_MESSAGE_CHARS)
    const patientContext = isApprovedDoctor ? rawContext.slice(0, MAX_CONTEXT_CHARS) : ""
    // Only the caller's own turns are relayed from client history
    // (QA Round 3, adversarial F10): assistant turns in the request
    // body are client-supplied text wearing a trusted costume — the
    // panels' canned fallback replies (and anything else a modified
    // client invents) must not re-enter the prompt as things the
    // model "said". User turns keep follow-up questions intelligible.
    const history = rawHistory
      .filter(
        (m: { role?: unknown; content?: unknown }) =>
          m?.role === "user" && typeof m?.content === "string"
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

    // Prior user turns ride inside the single user message as a
    // labelled recap — with assistant turns dropped, a multi-turn
    // `contents` array would be consecutive user turns, which the
    // API does not accept.
    const historyBlock =
      history.length > 0
        ? `Earlier in this conversation, the user said:\n${history
            .map((m: { content: string }) => `- ${m.content}`)
            .join("\n")}\n\n`
        : ""
    const contents = [
      {
        role: "user",
        parts: [
          {
            text: patientContext
              ? `${historyBlock}Patient context:\n${patientContext}\n\nDoctor's question: ${message}`
              : `${historyBlock}${message}`,
          },
        ],
      },
    ]

    // A hung upstream must not hold the request (and the panel's
    // spinner) open indefinitely (QA Round 3, ai-chat L3).
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    let geminiResponse: Response
    try {
      geminiResponse = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 800,
          },
        }),
      })
    } finally {
      clearTimeout(timeout)
    }

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
    let reply =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ||
      "I couldn't generate a response for that. Could you rephrase your question?"

    // The not-a-diagnosis caveat is appended server-side for
    // patient-mode replies (QA Round 3, ai-chat #6): asking the model
    // nicely was the only enforcement before, so it landed in
    // whichever answers the model felt like adding it to.
    if (isPatient && reply.length > 120 && !/medical advice/i.test(reply)) {
      reply +=
        "\n\nPlease note: I can't diagnose or replace professional medical advice — a doctor should confirm anything important."
    }

    return NextResponse.json({ reply })
  } catch (error: unknown) {
    console.error("[api/chat] Unexpected error:", error)
    return NextResponse.json(
      { error: "The AI assistant could not respond. Please try again.", fallback: true },
      { status: 500 }
    )
  }
}
