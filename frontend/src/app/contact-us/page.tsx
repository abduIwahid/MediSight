import type { Metadata } from "next"
import Link from "next/link"
import { Mail } from "lucide-react"
import BrandMark from "@/components/shared/BrandMark"
import { PublicContactForm } from "@/components/shared/PublicContactForm"

export const metadata: Metadata = {
  title: "Contact — WhyRisk",
  description:
    "Contact the WhyRisk maintainer about the platform, the diabetes risk model, or an account. Messages are emailed directly to the maintainer.",
}

/**
 * Public contact page (features round, 2026-10-30). The signed-in
 * dashboard has its own /contact; this one serves visitors who have
 * no account yet. The form posts to /api/contact's rate-limited
 * anonymous path — the same Resend delivery to the maintainer.
 * Chrome mirrors the public model-card page.
 */
export default function PublicContactPage() {
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
            <Link href="/model-card" className="text-muted-foreground transition hover:text-foreground">
              The model
            </Link>
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

      <main id="main-content" className="mx-auto max-w-4xl px-5 py-10">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[1.6px] text-brand-text">Contact</p>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">Talk to the maintainer</h1>
        <p className="mt-3 max-w-[640px] leading-relaxed text-muted-foreground">
          WhyRisk is an experimental research tool maintained by its developer. Questions about the platform,
          the model, or getting access — send a message here and it lands in the maintainer&apos;s inbox.
        </p>

        <div className="mt-6 flex items-start gap-3 rounded-xl border bg-card p-5 shadow-card">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-secondary text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">Prefer email?</p>
            <p className="text-muted-foreground">
              Write to{" "}
              <a href="mailto:contact@abdulwahid.me" className="font-medium text-primary hover:underline">
                contact@abdulwahid.me
              </a>{" "}
              — the same inbox this form delivers to.
            </p>
          </div>
        </div>

        <section className="mt-4 rounded-xl border bg-card p-5 shadow-card sm:p-6" aria-label="Contact form">
          <PublicContactForm />
        </section>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Please do not send patient health information through this form — it is for questions about the
          platform itself. If you are a patient, clinical questions belong with your care team.
        </p>
      </main>

      <footer className="bg-foreground py-8 text-[#C8D6DA]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3.5 px-5">
          <span className="flex items-center gap-2.5">
            <BrandMark className="h-9 w-9 shrink-0" />
            <span className="text-lg font-bold tracking-tight text-white">WhyRisk</span>
          </span>
          <span className="flex items-center gap-5 text-sm font-medium">
            <Link href="/welcome" className="text-white underline decoration-[#2E7FA8] decoration-2 underline-offset-4 hover:opacity-80">
              Home
            </Link>
            <Link href="/model-card" className="text-white underline decoration-[#2E7FA8] decoration-2 underline-offset-4 hover:opacity-80">
              Model card
            </Link>
            <Link href="/login" className="text-white underline decoration-[#2E7FA8] decoration-2 underline-offset-4 hover:opacity-80">
              Sign in
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
