"use client"
import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CheckCircle2, XCircle, Stethoscope, RotateCcw } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import { createClient } from "@/lib/supabase/client"
import { fmtDateTime } from "@/lib/dates"
import { doctorStatusClass } from "@/lib/status"

export interface DoctorRow {
  user_id: string
  license_number: string
  hospital: string | null
  specialization: string | null
  experience: number | null
  phone: string | null
  status: "pending" | "approved" | "rejected"
  created_at: string
  profile: { full_name: string; email: string; hospital_id?: string | null } | null
  /** Decision stamp (migration 20261025200000) — who decided, when.
   *  Fetched separately by the page so the queue still renders on a
   *  database where that migration has not been applied yet. */
  reviewed_by?: string | null
  reviewed_at?: string | null
  reviewer?: { full_name: string } | null
}

// Status chip colours live in lib/status.ts (the one palette).
const STATUS_STYLES = doctorStatusClass

export function DoctorVerificationView({ doctors, viewerName, hospitals, loadError }: {
  doctors: DoctorRow[]
  /** The reviewing admin's display name — used to show the decision
   *  stamp immediately after a decision, before the page reloads. */
  viewerName?: string | null
  /** Platform hospitals for the approval-time scope assignment
   *  (QA Round 3, onboarding O-1). */
  hospitals: { id: string; name: string }[]
  /** Set when the queue fetch failed (QA Round 3, states F-01). */
  loadError?: boolean
}) {
  const [rows, setRows] = useState(doctors)
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending")
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  // BOTH decisions are confirmed before they are written: rejection
  // got its dialog in QA Round 1 (item 26), but approval — the
  // access-granting direction, and the easier misclick — fired on a
  // single click until QA Round 2 (cluster 20d).
  const [pendingRejection, setPendingRejection] = useState<{ userId: string; name: string } | null>(null)
  const [pendingApproval, setPendingApproval] = useState<{ userId: string; name: string; declaredHospital: string | null; currentHospitalId: string | null } | null>(null)
  const [approvalHospitalId, setApprovalHospitalId] = useState<string>("")
  const [rejectionReason, setRejectionReason] = useState("")
  // Session-only record of rejection reasons (QA Round 3, admin A3):
  // there is no doctors.rejection_reason column yet (owner-ask), so
  // the reason is captured and shown for this session; persisting it
  // needs the migration.
  const [sessionReasons, setSessionReasons] = useState<Record<string, string>>({})
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (pendingApproval || pendingRejection) confirmButtonRef.current?.focus()
  }, [pendingApproval, pendingRejection])

  const openApproval = (d: DoctorRow) => {
    setActionError(null)
    setActionSuccess(null)
    // Pre-select the hospital the doctor declared, matched by name —
    // the admin still confirms or changes it before approving.
    const declared = d.hospital?.trim().toLowerCase()
    const matched = declared
      ? hospitals.find((h) => h.name.trim().toLowerCase() === declared)
      : undefined
    setApprovalHospitalId(d.profile?.hospital_id || matched?.id || "")
    setPendingApproval({
      userId: d.user_id,
      name: d.profile?.full_name || "this doctor",
      declaredHospital: d.hospital,
      currentHospitalId: d.profile?.hospital_id ?? null,
    })
  }

  const handleApproval = async () => {
    if (!pendingApproval || !approvalHospitalId) return
    const { userId, name } = pendingApproval
    const hospitalName = hospitals.find((h) => h.id === approvalHospitalId)?.name || "the selected hospital"
    setPendingApproval(null)
    setUpdatingId(userId)
    setActionError(null)
    setActionSuccess(null)
    const { data: { user } } = await supabase.auth.getUser()
    const decidedAt = new Date().toISOString()
    // Status + decision stamp in ONE verified update (QA Round 3,
    // data-integrity DI3-13 / admin A10): the stamp used to be a
    // second, best-effort write, so a decided row could sit in the
    // queue with no reviewer attached.
    const { data, error } = await supabase
      .from("doctors")
      .update({ status: "approved", reviewed_by: user?.id ?? null, reviewed_at: decidedAt })
      .eq("user_id", userId)
      .select("user_id")
    if (error || !data || data.length === 0) {
      setActionError("The approval could not be saved. You may not have permission to review doctor applications.")
      setUpdatingId(null)
      return
    }
    // The scope assignment is the point of the approval (QA Round 3,
    // onboarding O-1): doctors self-declare a hospital as free text,
    // and without THIS write profiles.hospital_id stays NULL and
    // every same-hospital policy returns nothing in the approved
    // doctor's workspace. Verified like every other write; a failure
    // here is reported as the partial success it is.
    if (pendingApproval.currentHospitalId !== approvalHospitalId) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .update({ hospital_id: approvalHospitalId })
        .eq("id", userId)
        .select("id")
      if (profileError || !profileRows || profileRows.length === 0) {
        setRows((prev) => prev.map((r) => (r.user_id === userId ? {
          ...r, status: "approved", reviewed_by: user?.id ?? r.reviewed_by ?? null,
          reviewed_at: decidedAt, reviewer: viewerName ? { full_name: viewerName } : r.reviewer ?? null,
        } : r)))
        setActionError(`${name} was approved, but their hospital assignment could not be saved. Assign ${hospitalName} in User Management so their workspace is scoped correctly.`)
        setUpdatingId(null)
        return
      }
    }
    setRows((prev) => prev.map((r) => (r.user_id === userId ? {
      ...r,
      status: "approved",
      reviewed_by: user?.id ?? r.reviewed_by ?? null,
      reviewed_at: decidedAt,
      reviewer: viewerName ? { full_name: viewerName } : r.reviewer ?? null,
      profile: r.profile ? { ...r.profile, hospital_id: approvalHospitalId } : r.profile,
    } : r)))
    setActionSuccess(`${name} approved and assigned to ${hospitalName}.`)
    setUpdatingId(null)
  }

  const handleRejection = async () => {
    if (!pendingRejection) return
    const { userId, name } = pendingRejection
    const reason = rejectionReason.trim()
    setPendingRejection(null)
    setUpdatingId(userId)
    setActionError(null)
    setActionSuccess(null)
    const { data: { user } } = await supabase.auth.getUser()
    const decidedAt = new Date().toISOString()
    const { data, error } = await supabase
      .from("doctors")
      .update({ status: "rejected", reviewed_by: user?.id ?? null, reviewed_at: decidedAt })
      .eq("user_id", userId)
      .select("user_id")
    if (error || !data || data.length === 0) {
      setActionError("The decision could not be saved. You may not have permission to review doctor applications.")
    } else {
      if (reason) setSessionReasons((prev) => ({ ...prev, [userId]: reason }))
      setRows((prev) => prev.map((r) => (r.user_id === userId ? {
        ...r,
        status: "rejected",
        reviewed_by: user?.id ?? r.reviewed_by ?? null,
        reviewed_at: decidedAt,
        reviewer: viewerName ? { full_name: viewerName } : r.reviewer ?? null,
      } : r)))
      setActionSuccess(`${name}'s application was rejected. They can be re-opened from the Rejected list if the decision changes.`)
    }
    setRejectionReason("")
    setUpdatingId(null)
  }

  // Re-opening a decided application (QA Round 3, admin A3): decisions
  // used to be a one-way trap — an approved doctor could never be
  // revoked here and a rejected one could never be reconsidered.
  const handleReopen = async (d: DoctorRow) => {
    setUpdatingId(d.user_id)
    setActionError(null)
    setActionSuccess(null)
    const { data, error } = await supabase
      .from("doctors")
      .update({ status: "pending" })
      .eq("user_id", d.user_id)
      .select("user_id")
    if (error || !data || data.length === 0) {
      setActionError("The application could not be re-opened. You may not have permission to review doctor applications.")
    } else {
      setRows((prev) => prev.map((r) => (r.user_id === d.user_id ? { ...r, status: "pending" } : r)))
      setActionSuccess(`${d.profile?.full_name || "The application"} is back in the pending queue.`)
    }
    setUpdatingId(null)
  }

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter)
  const pendingCount = rows.filter((r) => r.status === "pending").length

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive-text">
        The verification queue could not be loaded. Please reload the page to try again.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div role="status" className="rounded-xl border border-[#1E7A46]/30 bg-[#E2F0E6] px-4 py-3 text-sm text-[#1E7A46]">
          {actionSuccess}
        </div>
      )}
      {pendingApproval && (
        <div role="alertdialog" aria-label="Confirm approval" aria-describedby="approval-desc" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#1E7A46]/30 bg-[#E2F0E6] px-4 py-3 text-sm">
          <div id="approval-desc" className="text-[#1E7A46]">
            <p>
              Approve <strong>{pendingApproval.name}</strong> as a doctor? They will gain access to the Doctor Portal and can be booked by patients. This decision is recorded with your name.
            </p>
            <p className="mt-1">
              Approving also assigns the hospital their workspace is scoped to
              {pendingApproval.declaredHospital ? <> — they declared <strong>{pendingApproval.declaredHospital}</strong> on their application</> : ""}.
              Confirm the hospital before approving:
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={approvalHospitalId} onValueChange={setApprovalHospitalId}>
              <SelectTrigger className="w-56 bg-card" aria-label={`Hospital assignment for ${pendingApproval.name}`}>
                <SelectValue placeholder="Choose a hospital" />
              </SelectTrigger>
              <SelectContent>
                {hospitals.map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={handleApproval}
              disabled={!approvalHospitalId}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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
        <div role="alertdialog" aria-label="Confirm rejection" aria-describedby="rejection-desc" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#C0392B]/30 bg-[#FAE9E7] px-4 py-3 text-sm">
          <div id="rejection-desc" className="text-[#C0392B]">
            <p>
              Reject <strong>{pendingRejection.name}</strong>&apos;s doctor application? This decision is recorded with your name. The applicant sees that the application was rejected; they can ask for it to be re-opened.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:ml-auto">
            <input
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason (optional, kept with this review session)"
              aria-label="Rejection reason"
              className="h-10 w-72 rounded-xl border border-input bg-card px-3 text-sm"
            />
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={handleRejection}
              className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-white hover:bg-destructive/90"
            >
              Confirm rejection
            </button>
            <button
              type="button"
              onClick={() => { setPendingRejection(null); setRejectionReason("") }}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Doctor Verification</h2>
          {pendingCount > 0 && (
            <Badge className="bg-[#FDF0DC] text-[#A85008] border-[#D97706]/30">{pendingCount} pending</Badge>
          )}
        </div>
        <div className="inline-flex max-w-full overflow-x-auto rounded-xl border bg-muted/40 p-1" role="group" aria-label="Filter applications by status">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
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
            <div key={d.user_id} className="rounded-xl border bg-card p-5 shadow-card">
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
                  {sessionReasons[d.user_id] && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Reason recorded this session: {sessionReasons[d.user_id]}
                    </p>
                  )}
                </div>

                {d.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={updatingId === d.user_id}
                      onClick={() => openApproval(d)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      disabled={updatingId === d.user_id}
                      onClick={() => { setActionError(null); setActionSuccess(null); setPendingRejection({ userId: d.user_id, name: d.profile?.full_name || "this doctor" }) }}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                )}
                {d.status === "approved" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      disabled={updatingId === d.user_id}
                      onClick={() => { setActionError(null); setActionSuccess(null); setPendingRejection({ userId: d.user_id, name: d.profile?.full_name || "this doctor" }) }}
                    >
                      <XCircle className="h-4 w-4" />
                      Revoke approval
                    </Button>
                  </div>
                )}
                {d.status === "rejected" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={updatingId === d.user_id}
                      onClick={() => handleReopen(d)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Re-open application
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {rows.length >= 200 && (
        <p className="text-xs text-muted-foreground">
          Showing the 200 most recent applications — older applications are not listed here.
        </p>
      )}
    </div>
  )
}
