"use client"

import { Mail, ExternalLink, Send, MessageSquare, ShieldCheck, Activity } from "lucide-react"
import Link from "next/link"

export default function ContactPage() {
  return (
    <div className="space-y-10 max-w-5xl mx-auto pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contact</h1>
        <p className="text-sm text-muted-foreground mt-1">MediSight is an experimental research tool maintained by its developer. For anything about the platform or the model, use the channels below.</p>
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
              Do not send patient-identifiable information through this page or by email. MediSight is an experimental research tool, not a clinical support channel, and it is not a certified medical device.
            </p>
          </div>
        </div>

        {/* Contact Form */}
        <div className="rounded-xl border bg-card p-6 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold">Send a Message</h3>
          </div>

          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Ayesha Khan"
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <input
                  type="email"
                  placeholder="doctor@hospital.org"
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Department / Facility</label>
                <input
                  type="text"
                  placeholder="Cardiology / Central Hospital"
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Inquiry Subject</label>
                <select className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option>Platform question</option>
                  <option>Model question</option>
                  <option>Account and access</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Message</label>
              <textarea
                rows={5}
                placeholder="Describe your request or technical issue..."
                className="w-full p-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              This form is not connected yet — submitting it does not send anything. Please use the email or GitHub link on the left instead.
            </p>

            <button type="submit" className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 sm:w-auto">
              <Send className="mr-2 h-4 w-4" /> Send Message
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
