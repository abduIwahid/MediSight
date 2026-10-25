"use client"
import { useState, useMemo } from "react"
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { Button } from "@/components/ui/button"
import { RefreshCw, Zap, AlertTriangle, CheckCircle2, Clock, TrendingDown, Activity } from "lucide-react"
import type { PredictionRow } from "@/lib/types"
import { EmptyState } from "@/components/shared/EmptyState"
import { dayKey, fmtDateTime } from "@/lib/dates"

export interface DriftData {
  psi_history?: { date: string; psi: number }[]
  current_psi?: number | null
  drift_detected?: boolean
  drift_threshold?: number | null
}

export interface MlModelStatus {
  status?: string
  version?: string
  model_name?: string
  last_trained?: string | null
  accuracy?: number | null
  metrics?: { auc_roc?: number; f1_score?: number; accuracy?: number }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Karachi' })
}

export function MLOpsView({
  driftData,
  modelStatus,
  predictionTrend,
  serviceConnected = false,
  viewerRole,
}: {
  driftData: DriftData | null
  modelStatus: MlModelStatus | null
  predictionTrend: PredictionRow[]
  serviceConnected?: boolean
  /** Accepted for call-site compatibility; the offline banner no longer prints the service address to end users. */
  mlServiceUrl?: string
  /** The viewing admin's role. Retraining is super-admin only (the API
   *  route enforces the same rule) — other roles see why the control
   *  is unavailable instead of a button that would 403 (QA Round 2,
   *  SA-1). */
  viewerRole?: string
}) {
  const [retraining, setRetraining] = useState(false)
  const [retrainMsg, setRetrainMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [confirmingRetrain, setConfirmingRetrain] = useState(false)
  const canRetrain = viewerRole === "super_admin"

  // Aggregate daily prediction volume + avg probability from raw prediction rows
  const dailyTrend = useMemo(() => {
    const map: Record<string, { date: string; count: number; avgProb: number; probSum: number; critical: number; high: number }> = {}
    for (const p of predictionTrend) {
      // Day buckets follow the product convention, Asia/Karachi.
      const day = p.created_at ? dayKey(p.created_at) : null
      if (!day) continue
      if (!map[day]) map[day] = { date: day, count: 0, avgProb: 0, probSum: 0, critical: 0, high: 0 }
      map[day].count++
      map[day].probSum += p.probability || 0
      if (p.severity === 'Critical') map[day].critical++
      if (p.severity === 'High') map[day].high++
    }
    return Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, avgProb: +(d.probSum / d.count).toFixed(3), date: formatDate(d.date) }))
  }, [predictionTrend])

  // The drift verdict comes from the ML service's own response (QA Round 1,
  // item 57) — not a threshold hard-coded in the frontend. The threshold is
  // only used to draw the reference line, from the service's value when it
  // provides one.
  const psiHistory = driftData?.psi_history || []
  const currentPsi = driftData?.current_psi ?? null
  const driftThreshold = driftData?.drift_threshold ?? 0.10
  const driftDetected = typeof driftData?.drift_detected === "boolean"
    ? driftData.drift_detected
    : currentPsi !== null && currentPsi > driftThreshold

  const handleRetrain = async () => {
    setRetraining(true)
    setRetrainMsg(null)
    try {
      // Retraining goes through a server-side proxy route — the ML service
      // requires an API key that must never be exposed to the browser.
      const res = await fetch('/api/admin/ml/retrain', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'The retrain could not be started. The ML service may be offline.')
      }
      setRetrainMsg({ type: 'success', text: data.status || 'Retraining triggered in background.' })
    } catch (e: unknown) {
      setRetrainMsg({ type: 'error', text: e instanceof Error && e.message ? e.message : 'The retrain could not be started. The ML service may be offline.' })
    } finally {
      setRetraining(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Not-Connected Banner — user-level wording only. The dev-server
          start command that used to live here was developer instructions
          shown to end users (QA Round 1, item 59). */}
      {!serviceConnected && (
        <div role="alert" className="flex flex-col sm:flex-row items-start gap-4 p-4 bg-[#FDF0DC] border border-[#D97706]/30 rounded-xl text-sm">
          <AlertTriangle className="h-5 w-5 text-[#A85008] flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-[#A85008]">ML service is offline</p>
            <p className="text-muted-foreground">
              The prediction service is not reachable right now, so predictions are paused.
              The prediction trend below is loaded directly from the database and stays available.
            </p>
          </div>
        </div>
      )}

      {/* Header cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Service Status</p>
          <div className="flex items-center gap-2 mt-1">
            {serviceConnected
              ? <CheckCircle2 className="h-4 w-4 text-[#1E7A46]" />
              : <AlertTriangle className="h-4 w-4 text-[#A85008]" />
            }
            <p className="font-semibold text-sm">{serviceConnected ? "Connected" : "Not Connected"}</p>
          </div>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Retrain Status</p>
          <p className="font-semibold text-sm mt-1 capitalize">{modelStatus?.status || "—"}</p>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Current PSI</p>
          <p className={`font-semibold text-sm mt-1 ${driftDetected ? 'text-[#C0392B]' : 'text-[#1E7A46]'}`}>
            {currentPsi !== null ? currentPsi.toFixed(4) : "N/A"}
          </p>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">14-Day Predictions</p>
          <p className="font-semibold text-sm mt-1">
            {predictionTrend.length.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Drift Alert Banner */}
      {driftDetected && (
        <div role="alert" className="flex items-center gap-3 p-4 bg-[#FAE9E7] border border-[#C0392B]/30 rounded-xl text-sm">
          <TrendingDown className="h-5 w-5 text-[#C0392B] flex-shrink-0" />
          <div>
            <p className="font-semibold text-[#C0392B]">Data Drift Detected</p>
            <p className="text-muted-foreground">
              The ML service reports drift{currentPsi !== null ? ` (PSI ${currentPsi.toFixed(4)}, threshold ${driftThreshold})` : ""}. Consider triggering a retrain below.
            </p>
          </div>
        </div>
      )}

      {/* Retraining Panel */}
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold">Trigger Model Retraining</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Starts a background retraining job on the ML service using the full training dataset.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Note: a retrained model keeps the service&apos;s &ldquo;1.0.0&rdquo; version label, and the model
              registry is not updated automatically — after a retrain, check the Retrain Status and Last
              trained fields rather than the version number.
            </p>
            {modelStatus?.last_trained && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last trained: {fmtDateTime(modelStatus.last_trained)}
              </p>
            )}
          </div>
          {canRetrain ? (
            <Button
              onClick={() => { setRetrainMsg(null); setConfirmingRetrain(true) }}
              disabled={retraining || !serviceConnected || modelStatus?.status === 'training'}
              className="ml-4 flex-shrink-0"
            >
              {retraining ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Triggering...</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" /> Retrain Now</>
              )}
            </Button>
          ) : (
            <p className="ml-4 flex-shrink-0 max-w-[220px] text-xs text-muted-foreground">
              Retraining changes the model for every hospital and is restricted to super admins.
            </p>
          )}
        </div>
        {confirmingRetrain && (
          <div role="alertdialog" aria-label="Confirm retraining" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#D97706]/30 bg-[#FDF0DC] px-4 py-3 text-sm">
            <p className="text-[#A85008]">
              Retrain the production model? Once training completes, the new model serves predictions for <strong>every hospital</strong>. This action is recorded in the audit log.
            </p>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => { setConfirmingRetrain(false); handleRetrain() }}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Confirm retrain
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRetrain(false)}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {retrainMsg && (
          <div role={retrainMsg.type === 'error' ? "alert" : "status"} className={`mt-4 p-3 rounded-lg text-sm ${
            retrainMsg.type === 'success'
              ? 'bg-[#E2F0E6] text-[#1E7A46] border border-[#1E7A46]/30'
              : 'bg-[#FAE9E7] text-[#C0392B] border border-[#C0392B]/30'
          }`}>
            {retrainMsg.text}
          </div>
        )}
        {!serviceConnected && (
          <p className="mt-3 text-xs text-muted-foreground">
            Retraining is available again once the ML service is back online.
          </p>
        )}
      </div>

      {/* 14-Day Prediction Volume Chart */}
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold mb-4">14-Day Prediction Volume & Avg Risk Score</h2>
        {dailyTrend.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No prediction data"
            description="There are no predictions in the last 14 days yet. The volume chart appears once assessments are run."
          />
        ) : (
          <>
          {/* Data-equivalent summary for assistive tech (QA Round 1, item 73). */}
          <p className="sr-only">
            {`In the last 14 days there were ${predictionTrend.length} predictions in total. The busiest day was ${dailyTrend.reduce((a, b) => (b.count > a.count ? b : a)).date} with ${Math.max(...dailyTrend.map((d) => d.count))} predictions.`}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyTrend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="count" name="Predictions" stroke="#2E7FA8" fill="#2E7FA8" fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
          </>
        )}
      </div>

      {/* PSI Drift History Chart */}
      {psiHistory.length > 0 && (
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h2 className="font-semibold mb-4">Feature Drift (PSI) History</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={psiHistory} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <ReferenceLine y={driftThreshold} stroke="#C0392B" strokeDasharray="4 4" label={{ value: 'Threshold', fill: '#C0392B', fontSize: 11 }} />
              <Line type="monotone" dataKey="psi" name="PSI" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Critical/High breakdown bar chart */}
      {dailyTrend.length > 0 && (
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h2 className="font-semibold mb-4">High & Critical Predictions per Day</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyTrend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Bar dataKey="high" name="High" fill="#D97706" radius={[2, 2, 0, 0]} />
              <Bar dataKey="critical" name="Critical" fill="#C0392B" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
