"use client"

import { useState } from "react"
import { Send, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"

const SUBJECT_OPTIONS = ["Platform question", "Model question", "Account and access", "Other"]

/**
 * The public contact form (posts to /api/contact's anonymous path).
 * Same fields and subject options as the signed-in dashboard form,
 * plus the email field a visitor without an account must supply so
 * the maintainer can reply. Errors from the API are shown verbatim —
 * they are written for end users (validation, rate limit, delivery
 * not configured), never swallowed into a generic failure.
 */
export function PublicContactForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [department, setDepartment] = useState("")
  const [subject, setSubject] = useState(SUBJECT_OPTIONS[0])
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === "sending") return
    setStatus("sending")
    setErrorMessage(null)

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, department, subject, message }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || "Your message could not be sent. Please try again later.")
      }
      setStatus("sent")
      setName("")
      setEmail("")
      setDepartment("")
      setSubject(SUBJECT_OPTIONS[0])
      setMessage("")
    } catch (err) {
      setStatus("error")
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : "Your message could not be sent. Please try again later."
      )
    }
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <CheckCircle2 className="h-10 w-10 text-[#1E7A46]" />
        <p className="font-semibold">Message sent</p>
        <p className="max-w-[420px] text-sm text-muted-foreground">
          Thanks for getting in touch — your message has been emailed to the maintainer, who replies to the
          address you gave.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          Send another message
        </button>
      </div>
    )
  }

  const inputClass =
    "h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="pc-name" className="text-sm font-medium">Your name</label>
          <input
            id="pc-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ayesha Khan"
            autoComplete="name"
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="pc-email" className="text-sm font-medium">Your email</label>
          <input
            id="pc-email"
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="pc-subject" className="text-sm font-medium">Subject</label>
          <select
            id="pc-subject"
            className={inputClass}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            {SUBJECT_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="pc-department" className="text-sm font-medium">
            Organisation <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="pc-department"
            className={inputClass}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="Hospital, university, company…"
            autoComplete="organization"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="pc-message" className="text-sm font-medium">Message</label>
        <textarea
          id="pc-message"
          className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe your question or request…"
          required
        />
      </div>

      {status === "error" && errorMessage && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive-text">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 disabled:opacity-60"
      >
        {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {status === "sending" ? "Sending…" : "Send message"}
      </button>
    </form>
  )
}
