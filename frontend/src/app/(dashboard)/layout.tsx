"use client"

import { useEffect, useRef, useState, Suspense } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { DashboardSidebar } from "@/components/layout/DashboardSidebar"
import { HeaderSearch } from "@/components/layout/HeaderSearch"
import { Search, Bell, User, Menu, Settings, LogOut, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { motion, AnimatePresence } from "framer-motion"
import BrandMark from "@/components/shared/BrandMark"
import { PulseLoader } from "@/components/shared/PulseLoader"
import { RiskBadge } from "@/components/shared/RiskBadge"

interface HeaderAlert {
  id: string
  type: string
  severity: string
  created_at: string
  patient_id: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// Middleware sends cross-portal mistakes here as /dashboard?error=...
// Only the portal messages middleware itself produces are rendered —
// the same discipline as the login page's ?error= allowlist.
const PORTAL_ERROR_MESSAGES = new Set([
  "This area is for patients only.",
])

function PortalErrorBanner() {
  const searchParams = useSearchParams()
  const portalError = searchParams.get("error")
  const [dismissed, setDismissed] = useState(false)

  if (!portalError || dismissed || !PORTAL_ERROR_MESSAGES.has(portalError)) return null

  return (
    <div className="mx-auto mb-6 max-w-7xl rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
      <span>{portalError}</span>
      <button onClick={() => setDismissed(true)} className="text-destructive/70 hover:text-destructive" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [headerAlerts, setHeaderAlerts] = useState<HeaderAlert[]>([])
  const [unreadAlertCount, setUnreadAlertCount] = useState(0)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMobileMenuOpen(false)
    setNotificationsOpen(false)
    setProfileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    // Basic focus handling: move focus into the drawer when it opens.
    drawerRef.current?.focus()
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [mobileMenuOpen])

  // Header bell: real unread alerts (status 'New'), refreshed on
  // navigation AND when the window regains focus — acknowledging an
  // alert on the Alerts page (or in another tab) otherwise leaves this
  // badge disagreeing with the Alerts Center until the next navigation
  // (QA Round 2, cluster 7). The badge exists only when there is
  // something unread.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const loadHeaderAlerts = () => {
      supabase
        .from("alerts")
        .select("id, type, severity, created_at, patient_id", { count: "exact" })
        .eq("status", "New")
        .order("created_at", { ascending: false })
        .limit(5)
        .then(({ data, count }) => {
          if (cancelled) return
          setHeaderAlerts((data as HeaderAlert[]) || [])
          setUnreadAlertCount(count ?? data?.length ?? 0)
        })
    }
    loadHeaderAlerts()
    window.addEventListener("focus", loadHeaderAlerts)
    return () => {
      cancelled = true
      window.removeEventListener("focus", loadHeaderAlerts)
    }
  }, [pathname])

  // Both header dropdowns close on outside click and on Escape.
  useEffect(() => {
    if (!notificationsOpen && !profileOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false)
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false)
        setProfileOpen(false)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [notificationsOpen, profileOpen])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background/50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="hidden lg:flex lg:w-72 lg:flex-none">
        <DashboardSidebar />
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
              <DashboardSidebar onClose={() => setMobileMenuOpen(false)} className="rounded-r-2xl border-r-0 shadow-2xl" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b bg-background px-4 shadow-sm sm:px-6 lg:px-8">
          <div className="flex flex-1 items-center gap-4">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background text-muted-foreground transition-all hover:bg-muted hover:text-foreground lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Brand lockup for small screens — the sidebar is hidden there */}
            <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
              <BrandMark className="h-8 w-8 shrink-0" />
              <span className="text-base font-bold tracking-tight">WhyRisk</span>
            </Link>

            <HeaderSearch />
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Search entry point below the sm breakpoint, where the
                header search form is hidden — opens the patients list. */}
            <Link
              href="/patients"
              aria-label="Search patients"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background text-muted-foreground transition-all hover:bg-muted hover:text-foreground sm:hidden"
            >
              <Search className="h-5 w-5" />
            </Link>
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen((open) => !open)
                  setProfileOpen(false)
                }}
                aria-expanded={notificationsOpen}
                aria-haspopup="true"
                aria-label={unreadAlertCount > 0 ? `Alerts, ${unreadAlertCount} unread` : "Alerts"}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
              >
                <Bell className="h-5 w-5" />
                {unreadAlertCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unreadAlertCount > 9 ? "9+" : unreadAlertCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-12 mt-2 w-80 rounded-2xl border border-border bg-card p-4 shadow-2xl ring-1 ring-black/5 z-50"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-semibold">Alerts</p>
                      <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => router.push("/alerts")}>View all</button>
                    </div>
                    {headerAlerts.length === 0 ? (
                      <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                        No new alerts at this time.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {headerAlerts.map((alert) => (
                          <Link
                            key={alert.id}
                            href={`/patients/${alert.patient_id}`}
                            onClick={() => setNotificationsOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted"
                          >
                            <RiskBadge severity={alert.severity} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{alert.type}</span>
                              <span className="block text-xs text-muted-foreground">{timeAgo(alert.created_at)}</span>
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((open) => !open)
                  setNotificationsOpen(false)
                }}
                aria-expanded={profileOpen}
                aria-haspopup="true"
                aria-label="Account menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary/20 bg-primary/10 text-primary transition-all hover:border-primary/50 hover:bg-primary/20"
              >
                <User className="h-5 w-5" />
              </button>
              
              <AnimatePresence>
                {profileOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-12 mt-2 w-56 rounded-2xl border border-border bg-card p-2 shadow-2xl ring-1 ring-black/5 z-50"
                  >
                    <div className="px-3 py-2 mb-2 border-b">
                      <p className="text-sm font-medium">Account Info</p>
                      <p className="text-xs text-muted-foreground truncate">Manage your preferences</p>
                    </div>
                    <Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                    <button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive">
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-auto custom-scrollbar p-4 sm:p-6 lg:p-8 relative">
          <Suspense fallback={<PulseLoader showWordmark={false} showLabel={false} />}>
            <PortalErrorBanner />
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

