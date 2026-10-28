"use client"

import { useEffect, useRef, useState, Suspense } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { PatientSidebar } from "@/components/layout/PatientSidebar"
import { Menu, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import BrandMark from "@/components/shared/BrandMark"
import { PulseLoader } from "@/components/shared/PulseLoader"
import { OfflineBanner } from "@/components/shared/OfflineBanner"

// Only these fixed messages may ever render in the banner (QA Round 3,
// patient F9 / auth M3 / accessibility A3): the ?error= parameter used
// to be rendered verbatim, so a crafted link could put attacker-chosen
// text in an official-looking alert inside the patient portal — the
// clinical layout already allowlisted its copy; this surface was
// missed. The dismiss button also gains an accessible name, a real hit
// area, and the banner a role="alert" so it is announced.
const PORTAL_ERROR_MESSAGES = new Set(["This area is for doctors only."])

function PortalErrorBanner() {
  const searchParams = useSearchParams()
  const rawError = searchParams.get("error")
  const portalError = rawError && PORTAL_ERROR_MESSAGES.has(rawError) ? rawError : null
  const [dismissed, setDismissed] = useState(false)

  if (!portalError || dismissed) return null

  return (
    <div role="alert" className="mx-auto mb-6 max-w-7xl rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text flex items-center justify-between gap-3">
      <span>{portalError}</span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-destructive/70 hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  // The drawer closes on Escape, focus moves into it when it opens, Tab
  // stays inside it, and focus returns to the menu button on close
  // (QA Round 3, accessibility A13 — same pattern as the staff shell).
  useEffect(() => {
    if (!mobileMenuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false)
        return
      }
      if (event.key === "Tab" && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    drawerRef.current?.focus()
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      menuButtonRef.current?.focus()
    }
  }, [mobileMenuOpen])

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background/50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="hidden lg:flex lg:w-72 lg:flex-none">
        <PatientSidebar />
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              ref={drawerRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-72 outline-none lg:hidden"
            >
              <PatientSidebar onClose={() => setMobileMenuOpen(false)} className="rounded-r-2xl border-r-0 shadow-2xl" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b bg-background px-4 shadow-card sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              ref={menuButtonRef}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background text-muted-foreground transition-all hover:bg-muted hover:text-foreground lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Brand lockup for small screens — the sidebar is hidden there */}
            <Link href="/patient/dashboard" className="flex items-center gap-2 lg:hidden">
              <BrandMark className="h-8 w-8 shrink-0" />
              <span className="text-base font-bold tracking-tight">WhyRisk</span>
            </Link>
          </div>
          <span className="text-sm font-semibold text-muted-foreground">Patient Portal</span>
        </header>

        <main id="main-content" className="flex-1 overflow-auto custom-scrollbar p-4 sm:p-6 lg:p-8 relative">
          <Suspense fallback={<PulseLoader showWordmark={false} showLabel={false} />}>
            <PortalErrorBanner />
            <OfflineBanner />
          </Suspense>
          {/* No AnimatePresence mode="wait" here: an exit animation made
              every navigation wait ~300ms for the old page to leave
              before the new one mounted. The keyed div keeps the enter
              animation only. */}
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="h-full w-full max-w-7xl mx-auto"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
