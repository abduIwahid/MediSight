"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { RiskBadge, RiskSeverity } from "@/components/shared/RiskBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { PulseLoader } from "@/components/shared/PulseLoader"
import type { PatientDemographics } from "@/lib/types"
import { fmtDateTime } from "@/lib/dates"
import { severityRowClass } from "@/lib/status"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Bell, CheckCircle2, Clock, AlertTriangle, ShieldCheck } from "lucide-react"
import Link from "next/link"

interface Alert {
  id: string
  patient_id: string
  type: string
  severity: RiskSeverity | string
  status: string
  created_at: string
  updated_at?: string
  patients?: {
    mrn: string
    demographics: PatientDemographics
  }
}

function getPatientName(alert: Alert): string {
  const d = alert.patients?.demographics || {}
  if (d.full_name) return d.full_name
  const first = d.first_name || d.firstName || ""
  const last = d.last_name || d.lastName || ""
  return `${first} ${last}`.trim() || alert.patients?.mrn || "Unknown Patient"
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

// Row tint per severity: severityRowClass from lib/status.ts (the one
// palette) — imported at the top of this file.

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [acknowledged, setAcknowledged] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [ackError, setAckError] = useState<string | null>(null)
  const [ackLoadError, setAckLoadError] = useState(false)
  // Exact totals from head-count queries (QA Round 3, dashboard H4):
  // the list itself is capped at 200, so header counts must not be
  // derived from the loaded rows.
  const [totalNew, setTotalNew] = useState(0)
  const [totalCritical, setTotalCritical] = useState(0)
  const [totalHigh, setTotalHigh] = useState(0)
  const supabase = createClient()

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    setAckLoadError(false)
    // All four reads in parallel, column-scoped, and the New list
    // capped (QA Round 3, perf P-2 / dashboard H4): it used to fetch
    // every New alert with select('*'), sequentially, however many
    // had accumulated.
    const [newRes, ackRes, countRes, criticalRes, highRes] = await Promise.all([
      supabase
        .from('alerts')
        .select('id, patient_id, type, severity, status, created_at, updated_at, patients(mrn, demographics)')
        .eq('status', 'New')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('alerts')
        .select('id, patient_id, type, severity, status, created_at, updated_at, patients(mrn, demographics)')
        .eq('status', 'Acknowledged')
        .order('updated_at', { ascending: false })
        .limit(5),
      supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'New'),
      supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'New').eq('severity', 'Critical'),
      supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'New').eq('severity', 'High'),
    ])

    if (newRes.error) {
      setLoadError(true)
    } else if (newRes.data) {
      setAlerts(newRes.data as unknown as Alert[])
    }
    if (ackRes.error) {
      setAckLoadError(true)
    } else if (ackRes.data) {
      setAcknowledged(ackRes.data as unknown as Alert[])
    }
    if (countRes.count != null) setTotalNew(countRes.count)
    if (criticalRes.count != null) setTotalCritical(criticalRes.count)
    if (highRes.count != null) setTotalHigh(highRes.count)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchAlerts()

    // Real-time subscription
    const channel = supabase
      .channel('public:alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, async (payload) => {
        // Fetch the full row with patient join
        const { data } = await supabase
          .from('alerts')
          .select('*, patients(mrn, demographics)')
          .eq('id', payload.new.id)
          .single()
        if (data && data.status === 'New') {
          // Dedupe by id (QA Round 3, dashboard M5): a reconnect replay
          // or a race with the initial fetch must not double-list.
          setAlerts((current) => (current.some((a) => a.id === data.id) ? current : [data as Alert, ...current]))
          setTotalNew((n) => n + 1)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alerts' }, (payload) => {
        if (payload.new.status !== 'New') {
          setAlerts((current) => current.filter((a) => a.id !== payload.new.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, fetchAlerts])

  const handleAcknowledge = async (id: string) => {
    const alert = alerts.find(a => a.id === id)
    if (!alert) return
    setAckError(null)
    // Optimistic move to the acknowledged list…
    setAlerts((current) => current.filter((a) => a.id !== id))
    setAcknowledged((prev) => [{ ...alert, status: 'Acknowledged', updated_at: new Date().toISOString() }, ...prev.slice(0, 4)])
    setTotalNew((n) => Math.max(0, n - 1))
    if (alert.severity === 'Critical') setTotalCritical((n) => Math.max(0, n - 1))
    if (alert.severity === 'High') setTotalHigh((n) => Math.max(0, n - 1))

    const { data: { user } } = await supabase.auth.getUser()
    // .select() verification: under RLS a refused update returns NO error
    // and zero rows — checking only `error` let a refused ack look like
    // success while the database still said "New" (QA Round 2, cluster 7).
    const { data: updated, error } = await supabase
      .from('alerts')
      .update({ status: 'Acknowledged', acknowledged_by: user?.id })
      .eq('id', id)
      .select('id')

    if (error || !updated || updated.length === 0) {
      // …rolled back on failure: the alert returns to the active list
      // and the failure is said out loud instead of styled as success.
      setAlerts((current) => [alert, ...current])
      setAcknowledged((prev) => prev.filter((a) => a.id !== id))
      setTotalNew((n) => n + 1)
      if (alert.severity === 'Critical') setTotalCritical((n) => n + 1)
      if (alert.severity === 'High') setTotalHigh((n) => n + 1)
      setAckError("That alert could not be acknowledged. It has been put back in the active list — please try again.")
    }
  }

  const criticalCount = totalCritical
  const highCount = totalHigh

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alerts Center</h1>
          <p className="text-muted-foreground">Alerts for patients assessed as High or Critical risk. This list updates live while the page is open.</p>
        </div>
        {totalNew > 0 && (
          <div className="flex gap-3">
            {criticalCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAE9E7] border border-[#C0392B]/25 text-[#C0392B] text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                {criticalCount} Critical
              </div>
            )}
            {highCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAE9E7] border border-[#C0392B]/25 text-[#C0392B] text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                {highCount} High
              </div>
            )}
          </div>
        )}
      </div>

      {ackError && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
          {ackError}
        </div>
      )}

      {/* Active Alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle>Active Alerts</CardTitle>
          </div>
          <CardDescription>
            {loadError
              ? "Alerts could not be loaded."
              : totalNew === 0
                ? "You're all caught up — no unacknowledged alerts."
                : `${totalNew} unacknowledged alert${totalNew !== 1 ? "s" : ""} require attention.${alerts.length >= 200 ? " Showing the newest 200." : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <PulseLoader showWordmark={false} />
            </div>
          ) : loadError ? (
            <div role="alert" className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <p className="text-sm text-destructive">Alerts could not be loaded. Please try again.</p>
              <Button variant="outline" size="sm" onClick={fetchAlerts}>Try again</Button>
            </div>
          ) : alerts.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No new alerts"
              description="Alerts are generated automatically when patients are assessed as High or Critical risk."
            />
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => {
                const name = getPatientName(alert)
                const mrn = alert.patients?.mrn || ""
                return (
                  <div
                    key={alert.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl transition-colors ${severityRowClass(alert.severity)}`}
                  >
                    <div className="space-y-1.5 mb-4 sm:mb-0">
                      <div className="flex items-center gap-3">
                        <RiskBadge severity={alert.severity} />
                        <span className="font-semibold text-sm">{alert.type}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <Link
                          href={`/patients/${alert.patient_id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {name}
                        </Link>
                        {mrn && <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{mrn}</span>}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {timeAgo(alert.created_at)} · {fmtDateTime(alert.created_at)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/patients/${alert.patient_id}`}>View Patient</Link>
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleAcknowledge(alert.id)}>
                        <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                        Acknowledge
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {ackLoadError && (
        <p role="note" className="text-xs text-muted-foreground">
          The recently acknowledged list could not be loaded — acknowledged alerts are unaffected.
        </p>
      )}

      {/* Recently Acknowledged */}
      {acknowledged.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#1E7A46]" />
              <CardTitle className="text-base">Recently Acknowledged</CardTitle>
            </div>
            <CardDescription>Last {acknowledged.length} acknowledged alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {acknowledged.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 opacity-70"
                >
                  <div className="flex items-center gap-3">
                    <RiskBadge severity={alert.severity} />
                    <div>
                      <span className="text-sm font-medium">{alert.type}</span>
                      <span className="text-xs text-muted-foreground ml-2">{getPatientName(alert)}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    acknowledged {timeAgo(alert.updated_at || alert.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
