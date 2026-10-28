"use client"
import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, UserCheck, RefreshCw } from "lucide-react"
import type { ProfileRow } from "@/lib/types"
import { roleLabel } from "@/lib/roles"
import { fmtDate } from "@/lib/dates"

const ALL_ROLES = ['super_admin', 'hospital_admin', 'doctor', 'nurse', 'data_scientist', 'patient']

// Roles an admin may assign from this screen. 'doctor' is deliberately
// absent: setting profiles.role = 'doctor' without a doctors-table row
// traps the account on the pending-approval screen with no application
// for anyone to approve. Doctor accounts are created through signup and
// verification instead.
const ASSIGNABLE_ROLES = ['super_admin', 'hospital_admin', 'nurse', 'data_scientist', 'patient']

export function UserManagementView({ profiles, hospitals, viewerRole, viewerId, viewerHospitalId, loadError }: {
  profiles: ProfileRow[]
  hospitals: { id: string; name: string }[]
  viewerRole: string
  /** The signed-in admin's own profile id + hospital — needed for the
   *  self-demotion guard and for telling a successful out-of-scope
   *  hospital move apart from a failed write (QA Round 2, 20b/20c). */
  viewerId?: string
  viewerHospitalId?: string | null
  /** Set when the server-side list fetch failed (QA Round 3, states
   *  F-03): an empty table must never pose as "no users". */
  loadError?: boolean
}) {
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [localProfiles, setLocalProfiles] = useState(profiles)
  // A role change is confirmed before it is written (QA Round 1, item 26):
  // picking a new role in the dropdown only stages it here.
  const [pendingRoleChange, setPendingRoleChange] = useState<{ profileId: string; name: string; from: string; to: string } | null>(null)
  // Hospital reassignment is staged + confirmed the same way (QA
  // Round 2, 20c): it re-scopes everything the user can see, so it
  // must not fire on a stray dropdown pick.
  const [pendingHospitalChange, setPendingHospitalChange] = useState<{ profileId: string; name: string; fromName: string; toId: string; toName: string } | null>(null)
  // Account lifecycle (QA Round 3, admin A2): reset-password and
  // delete used to exist only as orphaned API routes — no screen
  // called them. Both are super-admin powers (the routes enforce it).
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  const isSuperAdmin = viewerRole === 'super_admin'

  // Focus moves to the confirm button when a confirm bar opens
  // (QA Round 3, accessibility A12) — keyboard users land on the
  // decision, not at the top of the page.
  useEffect(() => {
    if (pendingRoleChange || pendingHospitalChange || resetTarget || deleteTarget) {
      confirmButtonRef.current?.focus()
    }
  }, [pendingRoleChange, pendingHospitalChange, resetTarget, deleteTarget])

  const filtered = localProfiles.filter(p => {
    const name = p.full_name?.toLowerCase() || ""
    const matchesQuery = !query || name.includes(query.toLowerCase())
    const matchesRole = roleFilter === "all" || p.role === roleFilter
    return matchesQuery && matchesRole
  })

  // Every role/hospital change goes through PATCH /api/admin/users/[id]
  // (QA Round 3, admin A1): this view used to write profiles directly
  // from the browser, which bypassed the route's last-super-admin
  // guard, its validation, and its audit row entirely. The route
  // answers { success } or { error } — the error text is shown as-is.
  const patchUser = async (profileId: string, body: Record<string, unknown>): Promise<string | null> => {
    try {
      const res = await fetch(`/api/admin/users/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) return data?.error || "The change could not be saved. Please try again."
      return null
    } catch {
      return "The change could not be saved. Please try again."
    }
  }

  const stageRoleChange = (profile: ProfileRow, newRole: string) => {
    if (!profile.role || newRole === profile.role) return
    setActionError(null)
    setActionSuccess(null)
    // Guards (QA Round 2, SA-5 / hospital-admin #7): demoting yourself
    // can lock you out of the admin area entirely; a hospital_admin
    // must not demote a super_admin (the grant direction was already
    // blocked — the demote direction was not); and the LAST super
    // admin can never be demoted. The admin API route enforces the
    // same rules server-side.
    if (viewerId && profile.id === viewerId) {
      setActionError("You can't change your own role — that could lock you out of the admin area. Ask another super admin to make this change.")
      return
    }
    if (profile.role === 'super_admin' && newRole !== 'super_admin') {
      if (viewerRole === 'hospital_admin') {
        setActionError("Only a super admin can change a super admin's role.")
        return
      }
      const superAdminCount = localProfiles.filter(p => p.role === 'super_admin').length
      if (superAdminCount <= 1) {
        setActionError("This is the only super admin account. Promote another user to super admin before changing this role.")
        return
      }
    }
    setPendingRoleChange({ profileId: profile.id, name: profile.full_name || "This user", from: profile.role, to: newRole })
  }

  const handleRoleChange = async (profileId: string, newRole: string) => {
    setPendingRoleChange(null)
    setUpdatingId(profileId)
    setActionError(null)
    setActionSuccess(null)
    const error = await patchUser(profileId, { role: newRole })
    if (error) {
      setActionError(error)
    } else {
      setLocalProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: newRole } : p))
      const target = localProfiles.find(p => p.id === profileId)
      setActionSuccess(`Role updated for ${target?.full_name || "the user"} — now ${roleLabel(newRole)}.`)
    }
    setUpdatingId(null)
  }

  const stageHospitalChange = (profile: ProfileRow, newHospitalId: string) => {
    if ((profile.hospital_id || "") === (newHospitalId || "")) return
    setActionError(null)
    setActionSuccess(null)
    setPendingHospitalChange({
      profileId: profile.id,
      name: profile.full_name || "This user",
      fromName: profile.hospitals?.name || "Unassigned",
      toId: newHospitalId,
      toName: hospitals.find(h => h.id === newHospitalId)?.name || "Unassigned",
    })
  }

  const handleHospitalChange = async (change: { profileId: string; name: string; toId: string; toName: string }) => {
    const { profileId, name, toId: newHospitalId, toName } = change
    setPendingHospitalChange(null)
    setUpdatingId(profileId)
    setActionError(null)
    setActionSuccess(null)
    // The API enforces the write; a hospital_admin moving a user out
    // of their hospital can no longer SEE the row afterwards, so a
    // successful call with an out-of-scope destination means the user
    // leaves this list (QA Round 2, hospital-admin #6).
    const movingOutOfViewerScope =
      viewerRole === 'hospital_admin' && (newHospitalId || null) !== (viewerHospitalId || null)
    const error = await patchUser(profileId, { hospital_id: newHospitalId || null })
    if (error) {
      setActionError(error)
    } else if (movingOutOfViewerScope) {
      setLocalProfiles(prev => prev.filter(p => p.id !== profileId))
      setActionSuccess(`${name} was moved to ${toName} and no longer appears in your hospital's list.`)
    } else {
      setLocalProfiles(prev => prev.map(p => {
        if (p.id === profileId) {
          const hospital = hospitals.find(h => h.id === newHospitalId)
          return { ...p, hospital_id: newHospitalId, hospitals: hospital ? { name: hospital.name } : null }
        }
        return p
      }))
      setActionSuccess(`${name} was moved to ${toName}.`)
    }
    setUpdatingId(null)
  }

  const handleResetPassword = async () => {
    if (!resetTarget) return
    if (resetPassword.length < 8) {
      setActionError("The new password must be at least 8 characters.")
      return
    }
    setUpdatingId(resetTarget.id)
    setActionError(null)
    setActionSuccess(null)
    try {
      const res = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: resetTarget.id, newPassword: resetPassword }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setActionError(data?.error || "The password could not be reset. Please try again.")
      } else {
        setActionSuccess(`Password reset for ${resetTarget.name}. Share the new password with them privately — it is not stored anywhere you can view it again.`)
        setResetTarget(null)
        setResetPassword("")
      }
    } catch {
      setActionError("The password could not be reset. Please try again.")
    }
    setUpdatingId(null)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setUpdatingId(deleteTarget.id)
    setActionError(null)
    setActionSuccess(null)
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setActionError(data?.error || "The account could not be deleted. Please try again.")
      } else {
        setLocalProfiles(prev => prev.filter(p => p.id !== deleteTarget.id))
        setActionSuccess(`Account deleted for ${deleteTarget.name}.`)
        setDeleteTarget(null)
        setDeleteConfirmText("")
      }
    } catch {
      setActionError("The account could not be deleted. Please try again.")
    }
    setUpdatingId(null)
  }

  // Options for a row's role dropdown: the assignable roles, minus
  // super_admin when the viewer is a hospital_admin (only a super_admin
  // may grant super_admin — the API enforces the same rule), plus
  // the user's current role when it isn't assignable (e.g. 'doctor') so
  // the control can still display it truthfully.
  const roleOptionsFor = (currentRole?: string | null) => {
    const options = ASSIGNABLE_ROLES.filter(
      r => !(viewerRole === 'hospital_admin' && r === 'super_admin')
    )
    if (currentRole && !options.includes(currentRole)) options.push(currentRole)
    return options
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive-text">
        The user list could not be loaded. Please reload the page to try again.
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
      {pendingHospitalChange && (
        <div role="alertdialog" aria-label="Confirm hospital change" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#D97706]/30 bg-[#FDF0DC] px-4 py-3 text-sm">
          <p className="text-[#A85008]">
            Move <strong>{pendingHospitalChange.name}</strong> from <strong>{pendingHospitalChange.fromName}</strong> to <strong>{pendingHospitalChange.toName}</strong>? This changes which hospital&apos;s patients and colleagues they can see.
          </p>
          <div className="ml-auto flex gap-2">
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={() => handleHospitalChange(pendingHospitalChange)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Confirm move
            </button>
            <button
              type="button"
              onClick={() => setPendingHospitalChange(null)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {pendingRoleChange && (
        <div role="alertdialog" aria-label="Confirm role change" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#D97706]/30 bg-[#FDF0DC] px-4 py-3 text-sm">
          <p className="text-[#A85008]">
            Change <strong>{pendingRoleChange.name}</strong>&apos;s role from <strong>{roleLabel(pendingRoleChange.from)}</strong> to <strong>{roleLabel(pendingRoleChange.to)}</strong>?
          </p>
          <div className="ml-auto flex gap-2">
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={() => handleRoleChange(pendingRoleChange.profileId, pendingRoleChange.to)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Confirm change
            </button>
            <button
              type="button"
              onClick={() => setPendingRoleChange(null)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {resetTarget && (
        <div role="alertdialog" aria-label="Reset password" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#D97706]/30 bg-[#FDF0DC] px-4 py-3 text-sm">
          <p className="text-[#A85008]">
            Set a new password for <strong>{resetTarget.name}</strong>. They will sign in with it next time — their current password stops working immediately.
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="New password (min. 8 characters)"
              aria-label={`New password for ${resetTarget.name}`}
              className="w-64 bg-card"
              autoComplete="new-password"
            />
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={handleResetPassword}
              disabled={resetPassword.length < 8 || updatingId === resetTarget.id}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Reset password
            </button>
            <button
              type="button"
              onClick={() => { setResetTarget(null); setResetPassword("") }}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div role="alertdialog" aria-label="Confirm account deletion" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <div className="text-destructive">
            <p>
              Delete <strong>{deleteTarget.name}</strong>&apos;s account? This permanently removes their sign-in and profile. Patient records they are linked to may also be removed by database cascade — this cannot be undone.
            </p>
            <p className="mt-1">Type <strong>{deleteTarget.name}</strong> to confirm.</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deleteTarget.name}
              aria-label="Type the user's name to confirm deletion"
              className="w-56 bg-card"
            />
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={handleDelete}
              disabled={deleteConfirmText !== deleteTarget.name || updatingId === deleteTarget.id}
              className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Delete account
            </button>
            <button
              type="button"
              onClick={() => { setDeleteTarget(null); setDeleteConfirmText("") }}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-9"
            aria-label="Search users by name"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-48" aria-label="Filter users by role">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ALL_ROLES.map(r => (
              <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-4 font-medium text-muted-foreground">Name</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Role</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Hospital</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Joined</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    {localProfiles.length === 0
                      ? "No users found."
                      : "No users match the current filter."}
                  </td>
                </tr>
              ) : filtered.map((profile) => (
                <tr key={profile.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {profile.full_name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{profile.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground font-mono">{profile.id.slice(0, 8)}…</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <Select
                      value={profile.role ?? undefined}
                      onValueChange={(val) => stageRoleChange(profile, val)}
                      disabled={updatingId === profile.id}
                    >
                      <SelectTrigger className="w-44 min-h-11 text-xs" aria-label={`Role for ${profile.full_name || "user"}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptionsFor(profile.role).map(r => (
                          <SelectItem key={r} value={r} className="text-xs">{roleLabel(r)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-4">
                    <Select
                      value={profile.hospital_id || "none"}
                      onValueChange={(val) => stageHospitalChange(profile, val === "none" ? "" : val)}
                      disabled={updatingId === profile.id}
                    >
                      <SelectTrigger className="w-44 min-h-11 text-xs" aria-label={`Hospital for ${profile.full_name || "user"}`}>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs text-muted-foreground">Unassigned</SelectItem>
                        {hospitals.map(h => (
                          <SelectItem key={h.id} value={h.id} className="text-xs">{h.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-4 text-muted-foreground whitespace-nowrap">
                    {profile.created_at ? fmtDate(profile.created_at) : "—"}
                  </td>
                  <td className="p-4">
                    {updatingId === profile.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="flex flex-col items-start gap-1">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <UserCheck className="h-4 w-4 text-[#1E7A46]" /> Active
                        </span>
                        {isSuperAdmin && viewerId !== profile.id && (
                          <>
                            <button
                              type="button"
                              onClick={() => { setActionError(null); setActionSuccess(null); setResetTarget({ id: profile.id, name: profile.full_name || "This user" }); setResetPassword("") }}
                              className="flex min-h-10 items-center text-xs font-medium text-primary hover:underline"
                            >
                              Reset password
                            </button>
                            <button
                              type="button"
                              onClick={() => { setActionError(null); setActionSuccess(null); setDeleteTarget({ id: profile.id, name: profile.full_name || "This user" }); setDeleteConfirmText("") }}
                              className="flex min-h-10 items-center text-xs font-medium text-destructive hover:underline"
                            >
                              Delete account
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t bg-muted/10 text-xs text-muted-foreground">
          {filtered.length} of {localProfiles.length} users shown
          {localProfiles.length >= 1000 ? " · Showing the most recent 1,000 users — refine by role to narrow the list." : ""}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Doctor accounts are created through signup and verification. To disable a staff account, set its role to Patient — the person keeps sign-in but loses all staff access.
      </p>
    </div>
  )
}
