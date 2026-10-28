"use client"

import Link from "next/link"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { Bell, AlertTriangle, Sparkles, Stethoscope, ArrowRight, ShieldCheck, Users, Activity, TrendingUp } from "lucide-react"
import { motion, type Variants } from "framer-motion"
import type { AlertRow } from "@/lib/types"
import { dayKey } from "@/lib/dates"

interface DashboardClientViewProps {
  recentAlerts: AlertRow[]
  totalPatients: number
  totalAlerts: number
  totalDoctors: number
  criticalAlerts: number
  totalPredictions: number
  /** True when any of the stat queries failed — the cards then say so
   *  instead of presenting a failed count as a real zero. */
  statsError?: boolean
  /** The recent-alerts query's OWN error (QA Round 3, dashboard H1):
   *  when it is set, the alerts panel shows an error state — never
   *  the green "All Clear". */
  alertsError?: boolean
  viewerRole?: string | null
  hospitalName?: string | null
}

function alertWhen(iso: string): string {
  const d = new Date(iso)
  // "Today" means today in Asia/Karachi (the product convention in
  // lib/dates), not the viewer's device day (QA Round 3, dashboard M7).
  const sameDay = dayKey(iso) === dayKey(new Date().toISOString())
  const time = d.toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit', timeZone: "Asia/Karachi" })
  if (sameDay) return time
  return `${d.toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: "Asia/Karachi" })}, ${time}`
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
}

export function DashboardClientView({
  recentAlerts, totalPatients, totalAlerts, totalDoctors, criticalAlerts, totalPredictions, statsError = false,
  alertsError = false, viewerRole = null, hospitalName = null
}: DashboardClientViewProps) {
  const scopeLabel =
    viewerRole === "super_admin"
      ? "Platform-wide — all hospitals"
      : hospitalName
        ? `Scoped to ${hospitalName} and the records your role can access`
        : "Scoped to the records your role can access"
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8 max-w-7xl mx-auto pb-8"
    >
      {/* Hero Banner */}
      <motion.div variants={itemVariants} className="relative overflow-hidden rounded-xl bg-primary p-6 sm:p-10 text-white shadow-card">
        <div className="relative z-10 max-w-3xl space-y-4">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8FC3DC]"
          >
            <Sparkles className="h-4 w-4" /> WhyRisk — Clinical Intelligence Platform
          </motion.p>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">Your patients, scored and explained</h1>
          <p className="text-sm sm:text-base text-white/75 leading-relaxed max-w-2xl">
            Patient risk scores, critical alerts, and model predictions for your facility — each score with the factors behind it.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-4">
            <Link href="/patients/new" className="inline-flex items-center justify-center rounded-lg bg-[#1F6E96] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1F6E96]/90">
              New Risk Assessment <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link href="/alerts" className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              View All Alerts
            </Link>
          </div>
        </div>
      </motion.div>

      <p className="text-xs text-muted-foreground -mt-4">{scopeLabel}</p>

      {statsError && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
          Some dashboard numbers could not be loaded, so the figures below may be incomplete. Reload the page to try again.
        </div>
      )}

      {/* Stats Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Patients", value: totalPatients, icon: Users, color: "text-[#2E7FA8]", bg: "bg-[#2E7FA8]/10", href: "/patients" },
          { label: "Active Doctors", value: totalDoctors, icon: Stethoscope, color: "text-primary", bg: "bg-secondary", href: "/doctors" },
          { label: "AI Predictions", value: totalPredictions, icon: Activity, color: "text-[#1E7A46]", bg: "bg-[#1E7A46]/10", href: "/analytics" },
          { label: "Unread Alerts", value: totalAlerts, icon: Bell, color: "text-[#A85008]", bg: "bg-[#D97706]/10", href: "/alerts" },
          { label: "Critical Alerts", value: criticalAlerts, icon: AlertTriangle, color: "text-[#C0392B]", bg: "bg-[#C0392B]/10", href: "/alerts" },
        ].map((stat, i) => (
          <Link key={i} href={stat.href} className={i === 4 ? "col-span-2 sm:col-span-1" : undefined}>
            <motion.div
              className="group bg-card border rounded-xl p-5 shadow-card transition-shadow duration-200 cursor-pointer"
            >
              <div className={`inline-flex p-2 rounded-xl ${stat.bg} mb-3 group-hover:scale-110 transition-transform`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-extrabold">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">{stat.label}</p>
            </motion.div>
          </Link>
        ))}
      </motion.div>

      {/* Quick Actions + Alerts */}
      <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-2">
        {/* Quick Actions */}
        <div className="bg-card border rounded-xl p-6 shadow-card space-y-4">
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Quick Actions
          </h2>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
            {[
              { label: "New Assessment", desc: "Register & run AI prediction", href: "/patients/new", icon: Users, color: "bg-secondary text-primary group-hover:bg-primary group-hover:text-white" },
              { label: "Patient Registry", desc: "Browse all patient records", href: "/patients", icon: Activity, color: "bg-secondary text-primary group-hover:bg-primary group-hover:text-white" },
              { label: "Doctor Directory", desc: "View available specialists", href: "/doctors", icon: Stethoscope, color: "bg-secondary text-primary group-hover:bg-primary group-hover:text-white" },
              { label: "Analytics", desc: "Population-level insights", href: "/analytics", icon: TrendingUp, color: "bg-secondary text-primary group-hover:bg-primary group-hover:text-white" },
              { label: "AI Assistant", desc: "Chat with the AI Assistant", href: "/assistant", icon: Sparkles, color: "bg-secondary text-primary group-hover:bg-primary group-hover:text-white" },
              { label: "Alerts Center", desc: "Critical & high risk alerts", href: "/alerts", icon: Bell, color: "bg-secondary text-primary group-hover:bg-primary group-hover:text-white" },
            ].map((action, i) => (
              <Link key={i} href={action.href}>
                <div className="group flex items-start gap-3 p-3 rounded-xl border bg-background hover:border-primary/30 hover:shadow-card transition-all duration-200 cursor-pointer h-full">
                  <div className={`p-2 rounded-xl transition-all duration-200 flex-shrink-0 ${action.color}`}>
                    <action.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{action.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{action.desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Active Alerts */}
        <div className="bg-card border rounded-xl p-6 shadow-card flex flex-col">
          <div className="flex items-center justify-between border-b pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#FAE9E7] rounded-lg">
                <Bell className="h-4 w-4 text-[#C0392B]" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">Recent High &amp; Critical Alerts</h2>
                <p className="text-xs text-muted-foreground">The newest 8 new alerts. The Alerts Center holds the full list.</p>
              </div>
            </div>
            <Link href="/alerts" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              All Alerts <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {alertsError ? (
            <div role="alert" className="flex flex-col items-center justify-center flex-1 py-12 rounded-xl border border-destructive/30 bg-destructive/10 px-4 text-center">
              <AlertTriangle className="h-10 w-10 mb-3 text-destructive" />
              <p className="text-sm font-medium text-destructive">Alerts could not be loaded</p>
              <p className="text-xs mt-1 max-w-[240px] text-destructive">This panel can&apos;t tell whether there are active alerts right now. Reload the page, or open the Alerts Center.</p>
            </div>
          ) : !recentAlerts || recentAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
              <ShieldCheck className="h-10 w-10 mb-3 text-[#1E7A46] opacity-60" />
              <p className="text-sm font-medium text-foreground">All Clear</p>
              <p className="text-xs mt-1 text-center max-w-[200px]">No active critical or high risk alerts at this time.</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto custom-scrollbar max-h-[340px] pr-1">
              {recentAlerts.map((alert, i) => (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="group flex items-center justify-between p-3.5 rounded-xl border border-[#C0392B]/20 bg-[#FAE9E7]/50 transition-all cursor-pointer hover:bg-[#FAE9E7]"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full flex-shrink-0 bg-[#FAE9E7]">
                      <AlertTriangle className="h-3.5 w-3.5 text-[#C0392B]" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{alert.type}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        MRN: <span className="font-mono">{alert.patients?.mrn || alert.patient_id?.slice(0, 8)}</span>
                        {" "}&bull;{" "}
                        {alertWhen(alert.created_at)}
                      </p>
                    </div>
                  </div>
                  <RiskBadge severity={alert.severity ?? "Unknown"} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
