"use client"

import Link from "next/link"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { Bell, AlertTriangle, Sparkles, Stethoscope, ArrowRight, ShieldCheck, Users, Activity, TrendingUp } from "lucide-react"
import { motion, type Variants } from "framer-motion"
import type { AlertRow } from "@/lib/types"

interface DashboardClientViewProps {
  recentAlerts: AlertRow[]
  totalPatients: number
  totalAlerts: number
  totalDoctors: number
  criticalAlerts: number
  totalPredictions: number
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
  recentAlerts, totalPatients, totalAlerts, totalDoctors, criticalAlerts, totalPredictions
}: DashboardClientViewProps) {
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
            <Sparkles className="h-4 w-4" /> MediSight — Clinical Intelligence Platform
          </motion.p>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">Hospital Command Centre</h1>
          <p className="text-sm sm:text-base text-white/75 leading-relaxed max-w-2xl">
            Real-time monitoring of patient risk levels, critical alerts, and clinical AI predictions across your entire facility.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-4">
            <Link href="/patients/new" className="inline-flex items-center justify-center rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">
              New Risk Assessment <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link href="/alerts" className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              View All Alerts
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Patients", value: totalPatients, icon: Users, color: "text-[#2E7FA8]", bg: "bg-[#2E7FA8]/10", href: "/patients" },
          { label: "Active Doctors", value: totalDoctors, icon: Stethoscope, color: "text-primary", bg: "bg-secondary", href: "/doctors" },
          { label: "AI Predictions", value: totalPredictions, icon: Activity, color: "text-[#1E7A46]", bg: "bg-[#1E7A46]/10", href: "/analytics" },
          { label: "Unread Alerts", value: totalAlerts, icon: Bell, color: "text-[#D97706]", bg: "bg-[#D97706]/10", href: "/alerts" },
          { label: "Critical Alerts", value: criticalAlerts, icon: AlertTriangle, color: "text-[#C0392B]", bg: "bg-[#C0392B]/10", href: "/alerts" },
        ].map((stat, i) => (
          <Link key={i} href={stat.href}>
            <motion.div
              className="group bg-card border rounded-xl p-5 shadow-sm hover:shadow-card transition-shadow duration-200 cursor-pointer"
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
        <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "New Assessment", desc: "Register & run AI prediction", href: "/patients/new", icon: Users, color: "bg-secondary text-primary group-hover:bg-primary group-hover:text-white" },
              { label: "Patient Registry", desc: "Browse all patient records", href: "/patients", icon: Activity, color: "bg-secondary text-primary group-hover:bg-primary group-hover:text-white" },
              { label: "Doctor Directory", desc: "View available specialists", href: "/doctors", icon: Stethoscope, color: "bg-secondary text-primary group-hover:bg-primary group-hover:text-white" },
              { label: "Analytics", desc: "Population-level insights", href: "/analytics", icon: TrendingUp, color: "bg-secondary text-primary group-hover:bg-primary group-hover:text-white" },
              { label: "AI Assistant", desc: "Clinical copilot chat", href: "/assistant", icon: Sparkles, color: "bg-secondary text-primary group-hover:bg-primary group-hover:text-white" },
              { label: "Alerts Centre", desc: "Critical & high risk alerts", href: "/alerts", icon: Bell, color: "bg-secondary text-primary group-hover:bg-primary group-hover:text-white" },
            ].map((action, i) => (
              <Link key={i} href={action.href}>
                <div className="group flex items-start gap-3 p-3 rounded-xl border bg-background hover:border-primary/30 hover:shadow-sm transition-all duration-200 cursor-pointer h-full">
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
        <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between border-b pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <Bell className="h-4 w-4 text-red-500" />
              </div>
              <h2 className="text-lg font-bold tracking-tight">Live Alerts</h2>
            </div>
            <Link href="/alerts" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              All Alerts <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {!recentAlerts || recentAlerts.length === 0 ? (
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
                  className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                    alert.severity === 'Critical'
                      ? 'border-red-500/20 bg-red-500/5 hover:bg-red-500/10'
                      : 'border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full flex-shrink-0 ${alert.severity === 'Critical' ? 'bg-red-100 dark:bg-red-500/20' : 'bg-amber-100 dark:bg-amber-500/20'}`}>
                      <AlertTriangle className={`h-3.5 w-3.5 ${alert.severity === 'Critical' ? 'text-red-600' : 'text-amber-600'}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{alert.type}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        MRN: <span className="font-mono">{alert.patients?.mrn || alert.patient_id?.slice(0, 8)}</span>
                        {" "}&bull;{" "}
                        {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <RiskBadge severity={alert.severity ?? "Low"} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
