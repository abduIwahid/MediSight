"use client"
import { useMemo } from "react"
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts"
import { TrendingUp, Users, AlertTriangle, Activity, BarChart3 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { PredictionRow } from "@/lib/types"
import { EmptyState } from "@/components/shared/EmptyState"
import { dayKey } from "@/lib/dates"
import { severityChartColor, ALERT_STATUS_CHART_COLORS, DISEASE_CHART_COLORS } from "@/lib/status"

// Severity + alert-status chart colours come from the ONE palette in
// lib/status.ts — the same hues everywhere in the product, never a
// local rainbow (QA Round 2, cluster 26).
const SEVERITY_COLORS = severityChartColor
const ALERT_STATUS_COLORS = ALERT_STATUS_CHART_COLORS

// Disease series colours live in lib/status.ts with the rest of the
// palette (QA Round 3, visual V6) — token values only.
const DISEASE_COLORS = DISEASE_CHART_COLORS

function StatCard({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-card">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-xl p-6 shadow-card">
      <h2 className="font-semibold mb-4">{title}</h2>
      {children}
    </div>
  )
}

/**
 * Screen-reader data equivalent for a chart (QA Round 1, item 73):
 * the same numbers as a plain table, visually hidden.
 */
function SrOnlyTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

function ChartEmpty({ title, description }: { title: string; description: string }) {
  return <EmptyState icon={BarChart3} title={title} description={description} className="py-8" />
}

export function AnalyticsDashboard({ predictions, patientsByHospital, alertStats, recentPredictions, loadError = false, sourceErrors, viewerRole = null }: {
  predictions: PredictionRow[]
  patientsByHospital: { hospitals?: { name: string } | null }[]
  alertStats: { severity?: string | null; status?: string | null; created_at?: string }[]
  recentPredictions: PredictionRow[]
  loadError?: boolean
  /** Per-source failures (QA Round 3, states F-05): a failed source
   *  renders an error in ITS card, not a fake empty chart, and its
   *  KPI shows "—" instead of 0. */
  sourceErrors?: { predictions?: boolean; hospitals?: boolean; alerts?: boolean; recent?: boolean }
  viewerRole?: string | null
}) {
  const srcErr = sourceErrors || {}
  // 1. Severity distribution
  const severityData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of predictions) {
      const sev = p.severity ?? "Unknown"
      counts[sev] = (counts[sev] || 0) + 1
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [predictions])

  // 2. Disease distribution
  const diseaseData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of predictions) {
      if (p.disease) counts[p.disease] = (counts[p.disease] || 0) + 1
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [predictions])

  // 3. Patients per hospital
  const hospitalData = useMemo(() => {
    const counts: Record<string, { name: string; count: number }> = {}
    for (const p of patientsByHospital) {
      const name = p.hospitals?.name || "Unassigned"
      if (!counts[name]) counts[name] = { name, count: 0 }
      counts[name].count++
    }
    return Object.values(counts).sort((a, b) => b.count - a.count)
  }, [patientsByHospital])

  // 4. 30-day risk score trend (daily avg probability). Days are bucketed
  // in the app timezone (Asia/Karachi) — the same convention the report
  // and queue use — not by UTC slice.
  const riskTrend = useMemo(() => {
    const map: Record<string, { date: string; avgRisk: number; sum: number; count: number }> = {}
    for (const p of recentPredictions) {
      if (p.probability == null) continue // unrecorded scores are excluded, never averaged as 0 (QA Round 3, dashboard M3)
      const day = dayKey(p.created_at)
      if (!day) continue
      if (!map[day]) map[day] = { date: day, avgRisk: 0, sum: 0, count: 0 }
      map[day].sum += p.probability
      map[day].count++
    }
    return Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        date: new Date(`${d.date}T12:00:00+05:00`).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'Asia/Karachi' }),
        avgRisk: +(d.sum / d.count).toFixed(3),
      }))
  }, [recentPredictions])

  // 5. Alert status breakdown
  const alertStatusData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of alertStats) {
      const st = a.status ?? "Unknown"
      counts[st] = (counts[st] || 0) + 1
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [alertStats])

  // 6. Severity radar across diseases
  const radarData = useMemo(() => {
    const severities = ['Low', 'Moderate', 'High', 'Critical']
    const diseases = [...new Set(predictions.map(p => p.disease).filter((d): d is string => Boolean(d)))].slice(0, 5)
    return severities.map(sev => {
      const row: Record<string, string | number> = { severity: sev }
      for (const d of diseases) {
        row[d] = predictions.filter(p => p.disease === d && p.severity === sev).length
      }
      return row
    })
  }, [predictions])

  const diseaseKeys = [...new Set(predictions.map(p => p.disease).filter((d): d is string => Boolean(d)))].slice(0, 5)

  const criticalCount = alertStats.filter(a => a.severity === 'Critical').length
  // The average is over PREDICTIONS with a recorded score, not
  // patients — frequently assessed patients count more than once, and
  // predictions whose probability is NULL are excluded rather than
  // averaged in as zero (QA Round 3, dashboard M3).
  const scoredPredictions = predictions.filter((p) => p.probability != null)
  const unscoredCount = predictions.length - scoredPredictions.length
  const avgRisk = scoredPredictions.length > 0
    ? (scoredPredictions.reduce((s, p) => s + (p.probability || 0), 0) / scoredPredictions.length * 100).toFixed(1)
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clinical Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {viewerRole === "super_admin"
            ? "Population-level risk insights across all patients and hospitals."
            : "Population-level risk insights across the records your role can access."}
        </p>
        {(predictions.length >= 2000 || alertStats.length >= 2000 || patientsByHospital.length >= 2000 || recentPredictions.length >= 2000) && (
          <p className="text-xs text-muted-foreground mt-1">Based on the most recent 2,000 records.</p>
        )}
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
          Some analytics data could not be loaded, so the figures below may be incomplete. Reload the page to try again.
        </div>
      )}

      {predictions.length === 0 && !loadError && (
        <EmptyState
          icon={TrendingUp}
          title="No prediction data yet"
          description="Analytics populate as patients are registered and assessed. Run a first assessment to get started."
          actionLabel="New Assessment"
          actionHref="/patients/new"
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Predictions" value={srcErr.predictions ? "—" : predictions.length.toLocaleString()} sub={predictions.length >= 2000 ? "Most recent 2,000" : "All time"} />
        <StatCard icon={TrendingUp} label="Avg Risk Score (per prediction)" value={srcErr.predictions ? "—" : avgRisk !== null ? `${avgRisk}%` : "—"} sub={unscoredCount > 0 ? `Averaged across scored predictions; ${unscoredCount} had no recorded score` : "Averaged across predictions, not patients"} />
        <StatCard icon={AlertTriangle} label="Critical Alerts" value={srcErr.alerts ? "—" : criticalCount} sub="All statuses — the Dashboard counts new ones only" />
        <StatCard icon={Activity} label="Hospitals Tracked" value={srcErr.hospitals ? "—" : hospitalData.length} sub="Facilities with registered patients" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Severity Distribution Pie */}
        <ChartCard title="Risk Severity Distribution">
          {srcErr.predictions ? (
            <ChartEmpty title="Severity data could not be loaded" description="Reload the page to try again." />
          ) : severityData.length === 0 ? (
            <ChartEmpty title="No severity data yet" description="Severity distribution appears once predictions have been run." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={severityData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name">
                    {severityData.map((entry) => (
                      <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || "#5A6B73"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <SrOnlyTable caption="Predictions by severity" columns={["Severity", "Predictions"]} rows={severityData.map((d) => [d.name, d.value])} />
            </>
          )}
        </ChartCard>

        {/* Disease Distribution Bar */}
        <ChartCard title="Disease Distribution">
          {srcErr.predictions ? (
            <ChartEmpty title="Disease data could not be loaded" description="Reload the page to try again." />
          ) : diseaseData.length === 0 ? (
            <ChartEmpty title="No disease data yet" description="Disease distribution appears once predictions have been run." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={diseaseData} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} className="fill-muted-foreground" />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Bar dataKey="value" name="Predictions" radius={[0, 4, 4, 0]}>
                    {diseaseData.map((_, i) => (
                      <Cell key={i} fill={DISEASE_COLORS[i % DISEASE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <SrOnlyTable caption="Predictions by disease" columns={["Disease", "Predictions"]} rows={diseaseData.map((d) => [d.name, d.value])} />
            </>
          )}
        </ChartCard>

        {/* 30-Day Risk Trend Area Chart — solid low-opacity fill, no gradient */}
        <ChartCard title="30-Day Average Risk Score Trend">
          {srcErr.recent ? (
            <ChartEmpty title="Trend data could not be loaded" description="Reload the page to try again." />
          ) : riskTrend.length === 0 ? (
            <ChartEmpty title="No data in the last 30 days" description="The trend appears once predictions exist in this window." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={riskTrend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} formatter={(v) => [(Number(v ?? 0) * 100).toFixed(1) + '%', 'Avg Risk']} />
                  <Area type="monotone" dataKey="avgRisk" stroke="#2E7FA8" fill="#2E7FA8" fillOpacity={0.12} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
              <SrOnlyTable caption="Average risk score per day, last 30 days" columns={["Day", "Average risk"]} rows={riskTrend.map((d) => [d.date, `${(d.avgRisk * 100).toFixed(1)}%`])} />
              {recentPredictions.length >= 2000 && (
                <p className="text-xs text-muted-foreground mt-2">Based on the most recent 2,000 predictions in the last 30 days.</p>
              )}
            </>
          )}
        </ChartCard>

        {/* Patients per Hospital Bar */}
        <ChartCard title="Patient Volume by Hospital">
          {srcErr.hospitals ? (
            <ChartEmpty title="Hospital data could not be loaded" description="Reload the page to try again." />
          ) : hospitalData.length === 0 ? (
            <ChartEmpty title="No hospital data yet" description="Hospital volumes appear once patients are registered." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hospitalData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Bar dataKey="count" name="Patients" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <SrOnlyTable caption="Patients by hospital" columns={["Hospital", "Patients"]} rows={hospitalData.map((d) => [d.name, d.count])} />
              {patientsByHospital.length >= 2000 && (
                <p className="text-xs text-muted-foreground mt-2">Counts are based on the most recent 2,000 patient records.</p>
              )}
            </>
          )}
        </ChartCard>
      </div>

      {/* Alert Status + Severity Radar — Full Width */}
      <div className="grid md:grid-cols-2 gap-6">
        <ChartCard title="Alert Status Breakdown">
          {srcErr.alerts ? (
            <ChartEmpty title="Alert data could not be loaded" description="Reload the page to try again." />
          ) : alertStatusData.length === 0 ? (
            <ChartEmpty title="No alerts generated yet" description="Alert statuses appear once alerts have been raised." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={alertStatusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {alertStatusData.map((entry) => (
                      <Cell key={entry.name} fill={ALERT_STATUS_COLORS[entry.name] || "#5A6B73"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <SrOnlyTable caption="Alerts by status" columns={["Status", "Alerts"]} rows={alertStatusData.map((d) => [d.name, d.value])} />
            </>
          )}
        </ChartCard>

        <ChartCard title="Severity Radar by Disease">
          {srcErr.predictions ? (
            <ChartEmpty title="Radar data could not be loaded" description="Reload the page to try again." />
          ) : radarData.length === 0 || diseaseKeys.length === 0 ? (
            <ChartEmpty title="Not enough data for the radar" description="The radar needs predictions across more than one disease." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="severity" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} tick={{ fontSize: 9 }} />
                  {diseaseKeys.map((d, i) => (
                    <Radar key={d} name={d} dataKey={d} stroke={DISEASE_COLORS[i % DISEASE_COLORS.length]} fill={DISEASE_COLORS[i % DISEASE_COLORS.length]} fillOpacity={0.2} />
                  ))}
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
              <SrOnlyTable
                caption="Predictions by severity and disease"
                columns={["Severity", ...diseaseKeys]}
                rows={radarData.map((r) => [String(r.severity), ...diseaseKeys.map((d) => Number(r[d] ?? 0))])}
              />
            </>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
