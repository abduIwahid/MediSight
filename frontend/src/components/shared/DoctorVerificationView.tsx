"use client"
import { useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, Stethoscope } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import { fmtDateTime } from "@/lib/dates"

export interface DoctorRow {
  user_id: string
  license_number: string
  hospital: string | null
  specialization: string | null
  experience: number | null
  phone: string | null
  status: "pending" | "approved" | "rejected"
  created_at: string
  profile: { full_name: string; email: string } | null
  /** Decision stamp (migration 20261025200000) — who decided, when.
   *  Fetched separately by the page so the queue still renders on a
   *  database where that migration has not been applied yet. */
  reviewed_by?: string | null
  reviewed_at?: string | null
  reviewer?: { full_name: string } | null
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-[#FDF0DC] text-[#A85008] border-[#D97706]/30",
  approved: "bg-[#E2F0E6] text-[#1E7A46] border-[#1E7A46]/30",
  rejected: "bg-[#FAE9E7] text-[#C0392B] border-[#C0392B]/30",
}

export function DoctorVerificationView({ doctors, viewerName }: {
  doctors: DoctorRow[]
  /** The reviewing admin's display name — used to show the decision
   *  stamp immediately after a decision, before the page reloads. */
  viewerName?: string | null
}) {
  const [rows, setRows] = useState(doctors)
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending")
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // BOTH decisions are confirmed before they are written: rejection
  // got its dialog in QA Round 1 (item 26), but approval — the
  // access-granting direction, and the easier misclick — fired on a
  // single click until QA Round 2 (cluster 20d).
  const [pendingRejection, setPendingRejection] = useState<{ userId: string; name: string } | null>(null)
  const [pendingApproval, setPendingApproval] = useState<{ userId: string; name: string } | null>(null)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleDecision = async (userId: string, status: "approved" | "rejected") => {
    setPendingRejection(null)
    setPendingApproval(null)
    setUpdatingId(userId)
    setActionError(null)
    const { data: { user } } = await supabase.auth.getUser()
    // .select() verifies the write actually landed: RLS can match zero
    // rows without returning an error, and the old code styled that as
    // success.
    const { data, error } = await supabase
      .from("doctors")
      .update({ status })
      .eq("user_id", userId)
      .select("user_id")
    if (error || !data || data.length === 0) {
      setActionError("The decision could not be saved. You may not have permission to review doctor applications.")
    } else {
      const decidedAt = new Date().toISOString()
      setRows((prev) => prev.map((r) => (r.user_id === userId ? {
        ...r,
        status,
        reviewed_by: user?.id ?? r.reviewed_by ?? null,
        reviewed_at: decidedAt,
        reviewer: viewerName ? { full_name: viewerName } : r.reviewer ?? null,
      } : r)))
      // Best-effort audit stamp (doctors.reviewed_by / reviewed_at,
      // migration 20261025200000): kept separate from the decision
      // write so the decision itself never depends on the stamp
      // columns existing yet.
      const { error: stampError } = await supabase
        .from("doctors")
        .update({
          reviewed_by: user?.id ?? null,
          reviewed_at: decidedAt,
        })
        .eq("user_id", userId)
      if (stampError) console.warn("Reviewer stamp not saved:", stampError.message)
    }
    setUpdatingId(null)
  }

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter)
  const pendingCount = rows.filter((r) => r.status === "pending").length

  return (
    <div className="space-y-6">
      {actionError && (
        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}
      {pendingApproval && (
        <div role="alertdialog" aria-label="Confirm approval" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#1E7A46]/30 bg-[#E2F0E6] px-4 py-3 text-sm">
          <p className="text-[#1E7A46]">
            Approve <strong>{pendingApproval.name}</strong> as a doctor? They will gain access to the Doctor Portal and can be booked by patients. This decision is recorded with your name.
          </p>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => handleDecision(pendingApproval.userId, "approved")}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Confirm approval
            </button>
            <button
              type="button"
              onClick={() => setPendingApproval(null)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {pendingRejection && (
        <div role="alertdialog" aria-label="Confirm rejection" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#C0392B]/30 bg-[#FAE9E7] px-4 py-3 text-sm">
          <p className="text-[#C0392B]">
            Reject <strong>{pendingRejection.name}</strong>&apos;s doctor application? This decision is recorded with your name.
          </p>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => handleDecision(pendingRejection.userId, "rejected")}
              className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-white hover:bg-destructive/90"
            >
              Confirm rejection
            </button>
            <button
              type="button"
              onClick={() => setPendingRejection(null)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Doctor Verification</h2>
          {pendingCount > 0 && (
            <Badge className="bg-[#FDF0DC] text-[#A85008] border-[#D97706]/30">{pendingCount} pending</Badge>
          )}
        </div>
        <div className="inline-flex rounded-xl border bg-muted/40 p-1">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={filter === "pending" ? "No applications waiting" : "No applications here"}
          description={filter === "pending"
            ? "New doctor applications will appear here for review."
            : `There are no ${filter === "all" ? "" : `${filter} `}doctor applications to show.`}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <div key={d.user_id} className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{d.profile?.full_name || "Unnamed"}</p>
                    <Badge className={STATUS_STYLES[d.status]}>{d.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{d.profile?.email}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    <div><span className="text-muted-foreground">License:</span> {d.license_number}</div>
                    <div><span className="text-muted-foreground">Hospital:</span> {d.hospital || "—"}</div>
                    <div><span className="text-muted-foreground">Specialization:</span> {d.specialization || "—"}</div>
                    <div><span className="text-muted-foreground">Experience:</span> {d.experience != null ? `${d.experience} yrs` : "—"}</div>
                  </div>
                  {d.status !== "pending" && d.reviewed_at && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {d.status === "approved" ? "Approved" : "Rejected"}
                      {d.reviewer?.full_name ? ` by ${d.reviewer.full_name}` : ""} · {fmtDateTime(d.reviewed_at)}
                    </p>
                  )}
                </div>

                {d.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={updatingId === d.user_id}
                      onClick={() => setPendingApproval({ userId: d.user_id, name: d.profile?.full_name || "this doctor" })}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      disabled={updatingId === d.user_id}
                      onClick={() => setPendingRejection({ userId: d.user_id, name: d.profile?.full_name || "this doctor" })}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
