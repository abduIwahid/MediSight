"use client"

import { useState } from "react"
import { Mail, ExternalLink, Send, MessageSquare, ShieldCheck, Activity, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import Link from "next/link"

const SUBJECT_OPTIONS = ["Platform question", "Model question", "Account and access", "Other"]

export default function ContactPage() {
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
  return (
    <div className="space-y-10 max-w-5xl mx-auto pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contact</h1>
        <p className="text-sm text-muted-foreground mt-1">WhyRisk is an experimental research tool maintained by its developer. For anything about the platform or the model, use the channels below.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Contact Info Cards */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-base border-b pb-2">Channels</h3>

            <div className="flex items-start gap-3 text-sm">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-xs">Email</p>
                <p className="text-xs text-muted-foreground">contact@abdulwahid.me</p>
                <p className="text-[10px] text-muted-foreground">The developer&apos;s public contact email</p>
              </div>
            </div>

            <div className="flex items-start gap-3 text-sm">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <ExternalLink className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-xs">Project Repository</p>
                <Link href="https://github.com/abduIwahid/MediSight" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
                  github.com/abduIwahid/MediSight
                </Link>
                <p className="text-[10px] text-muted-foreground">Issues and questions live on GitHub</p>
              </div>
            </div>

            <div className="flex items-start gap-3 text-sm">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-xs">Model Status</p>
                <Link href="/model-card" className="text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
                  Public model card
                </Link>
                <p className="text-[10px] text-muted-foreground">Live service status and the model&apos;s documented limits</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/40 p-5 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" /> Before You Write
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Do not send patient-identifiable information through this page or by email. WhyRisk is an experimental research tool, not a clinical support channel, and it is not a certified medical device.
            </p>
          </div>
        </div>

        {/* Contact Form */}
        <div className="rounded-xl border bg-card p-6 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold">Send a Message</h3>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="contact-name" className="text-xs font-medium text-muted-foreground">Full Name</label>
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ayesha Khan"
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contact-email" className="text-xs font-medium text-muted-foreground">Email</label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor@hospital.org"
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="contact-department" className="text-xs font-medium text-muted-foreground">Department / Facility</label>
                <input
                  id="contact-department"
                  name="department"
                  type="text"
                  maxLength={120}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Cardiology / Central Hospital"
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contact-subject" className="text-xs font-medium text-muted-foreground">Inquiry Subject</label>
                <select
                  id="contact-subject"
                  name="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {SUBJECT_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="contact-message" className="text-xs font-medium text-muted-foreground">Message</label>
              <textarea
                id="contact-message"
                name="message"
                rows={5}
                required
                maxLength={5000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your request or technical issue..."
                className="w-full p-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {status === "sent" && (
              <div className="p-4 bg-primary/10 text-primary rounded-xl border border-primary/20 text-sm font-medium flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p>Your message has been sent. Replies go to the email address you entered above.</p>
              </div>
            )}

            {status === "error" && errorMessage && (
              <div className="p-4 bg-destructive/10 text-destructive rounded-xl border border-destructive/20 text-sm font-medium flex items-start gap-3">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p>{errorMessage}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60 disabled:pointer-events-none sm:w-auto"
            >
              {status === "sending" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> Send Message
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
