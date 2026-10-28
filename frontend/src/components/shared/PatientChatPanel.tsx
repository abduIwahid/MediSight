"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Bot, Send, User, Loader2, CalendarPlus } from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  /** Template-fallback replies carry the same visible badge the staff
   *  panel uses (QA Round 3, ai-chat L6) — previously only a small
   *  parenthetical in the text marked them. */
  fallback?: boolean
}

const SUGGESTED_PROMPTS = [
  "I've had a headache and dizziness for two days.",
  "What kind of doctor should I see for joint pain?",
  "I have a mild fever and sore throat — what should I do?",
]

// Offline fallback guidance: a small, clearly-framed symptom → specialist
// map so the patient assistant still answers its most common question
// while the AI service is unreachable (QA Round 1, item 89). Framed as
// general guidance, never a diagnosis.
const SYMPTOM_SPECIALIST_MAP: { keywords: string[]; specialist: string }[] = [
  { keywords: ["joint", "knee", "back pain", "bone", "arthritis"], specialist: "an Orthopedics or Rheumatology specialist" },
  { keywords: ["skin", "rash", "acne", "itching"], specialist: "a Dermatologist" },
  { keywords: ["eye", "vision", "sight"], specialist: "an Ophthalmologist" },
  { keywords: ["tooth", "teeth", "dental", "gum"], specialist: "a Dentist" },
  { keywords: ["fever", "flu", "cold", "cough", "sore throat", "headache"], specialist: "a General Physician" },
  { keywords: ["stomach", "abdomen", "digest", "acidity", "nausea"], specialist: "a Gastroenterologist" },
]

const EMERGENCY_REPLY =
  "**This could be an emergency.** Please seek immediate medical attention or call your local emergency number right now — don't wait on a chat response.\n\nThis assistant does not replace professional medical advice."

// Emergency screen (QA Round 3, ai-chat M5 / patient F8): whole-phrase
// matching with a negation guard, wider than the old four substrings —
// "breath" alone missed "can't breathe" phrasing variants in some
// orders and fired on "no chest pain". Runs BEFORE the API call and
// short-circuits it.
const EMERGENCY_PATTERNS: RegExp[] = [
  /chest (pain|tightness|pressure)/,
  /heart attack/,
  /can'?t breathe|cannot breathe|difficulty breathing|short(ness)? of breath|struggling to breathe/,
  /stroke|face drooping|slurred speech/,
  /(severe|heavy|won'?t stop) bleeding|bleeding (heavily|a lot)/,
  /seizure|convulsion/,
  /unconscious|passed out|fainted and/,
  /suicid|kill myself|end my life/,
  /overdose|took too many pills/,
  /severe allergic|throat (is )?(swelling|closing)|anaphyla/,
  /choking/,
]

function detectEmergency(message: string): boolean {
  const q = ` ${message.toLowerCase()} `
  return EMERGENCY_PATTERNS.some((pattern) => {
    const match = pattern.exec(q)
    if (!match) return false
    // Negation guard: "no chest pain", "not having a heart attack",
    // "don't have difficulty breathing" must not trigger the alarm.
    const before = q.slice(Math.max(0, match.index - 24), match.index)
    return !/\b(no|not|don'?t|doesn'?t|never|without)\b[^.]*$/.test(before)
  })
}

function generateLocalFallback(message: string): string {
  const q = message.toLowerCase()
  if (detectEmergency(message)) {
    return EMERGENCY_REPLY
  }
  const match = SYMPTOM_SPECIALIST_MAP.find((entry) => entry.keywords.some((k) => q.includes(k)))
  if (match) {
    return `Based on what you described, patients usually start with **${match.specialist}**. You can book one from the Book an Appointment button below.\n\nThis is general guidance, not a diagnosis — only a doctor who examines you can say what is going on.\n\n(Note: the AI service isn't reachable right now, so this is a general fallback response.)`
  }
  return "I'm the WhyRisk AI Assistant. Tell me a bit about your symptoms — how long you've had them and how they feel — and I'll suggest which specialist to book with.\n\nI can't diagnose you or run clinical predictions; a doctor handles that once you're booked in.\n\n(Note: the AI service isn't reachable right now, so this is a general fallback response.)"
}

export function PatientChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi, I'm the **WhyRisk AI Assistant**. Tell me what symptoms you're experiencing and I'll help point you to the right kind of doctor and get you booked in.\n\nI don't diagnose conditions or replace professional medical advice — for anything urgent, please seek emergency care right away."
    }
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async (text: string) => {
    if (!text.trim()) return
    const userMessage: Message = { id: Date.now().toString(), role: "user", content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      // Emergency wording short-circuits before any network call
      // (QA Round 3, ai-chat M5): the alert must not depend on the AI
      // service being up, slow, or in the mood to escalate.
      if (detectEmergency(text)) {
        setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: EMERGENCY_REPLY }])
        return
      }
      const recentHistory = messages
        .filter((m) => !m.fallback && m.id !== "welcome")
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }))
      let reply: string | null = null
      let usedFallback = false
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(35_000),
          body: JSON.stringify({ message: text, history: recentHistory, mode: "patient" }),
        })
        if (res.ok) {
          const data = await res.json()
          reply = data.reply
        }
      } catch {
        // fall through to local fallback
      }
      if (!reply) {
        reply = generateLocalFallback(text)
        usedFallback = true
      }

      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: reply!, fallback: usedFallback }])
    } catch (error) {
      // Nothing in the send path may throw uncaught (QA Round 3,
      // ai-chat M2).
      console.error("Patient chat send failed:", error)
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Something went wrong while generating a response. Please try again.",
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const renderContent = (content: string) =>
    content.split("\n").map((line, i) => {
      const parts = line.split(/\*\*(.+?)\*\*/g)
      return (
        <span key={i}>
          {parts.map((part, j) => (j % 2 === 1 ? <strong key={j}>{part}</strong> : part))}
          <br />
        </span>
      )
    })

  return (
    <Card className="flex flex-col h-[calc(100dvh-12rem)] min-h-[420px] border shadow-card">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle>AI Assistant</CardTitle>
        </div>
        <CardDescription>Symptom guidance and specialist recommendations — not a diagnosis.</CardDescription>
      </CardHeader>

      <CardContent role="log" aria-live="polite" className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 max-w-[88%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
            <div className={`flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
              {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div className={`px-4 py-3 rounded-xl text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
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
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </CardContent>

      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => handleSend(p)}
              disabled={isLoading}
              className="flex min-h-10 items-center rounded-full border bg-muted/30 px-3 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <CardFooter className="border-t p-3 flex flex-col gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(input) }}
          className="flex w-full items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe how you're feeling…"
            disabled={isLoading}
            aria-label="Message"
          />
          <Button type="submit" size="icon" aria-label="Send message" disabled={isLoading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <Link href="/patient/appointments/book" className="w-full">
          <Button variant="outline" className="w-full gap-2" type="button">
            <CalendarPlus className="h-4 w-4" />
            Book an Appointment
          </Button>
        </Link>
        <p className="w-full text-center text-xs text-muted-foreground">
          Your messages are sent to Google Gemini to generate answers. Please verify anything important with a doctor.
        </p>
      </CardFooter>
    </Card>
  )
}
