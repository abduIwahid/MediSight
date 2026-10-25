"use client"
import { useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, UserCheck, RefreshCw } from "lucide-react"
import type { ProfileRow } from "@/lib/types"

const ALL_ROLES = ['super_admin', 'hospital_admin', 'doctor', 'nurse', 'data_scientist', 'patient']

// Roles an admin may assign from this screen. 'doctor' is deliberately
// absent: setting profiles.role = 'doctor' without a doctors-table row
// traps the account on the pending-approval screen with no application
// for anyone to approve. Doctor accounts are created through signup and
// verification instead.
const ASSIGNABLE_ROLES = ['super_admin', 'hospital_admin', 'nurse', 'data_scientist', 'patient']

export function UserManagementView({ profiles, hospitals, viewerRole }: { profiles: ProfileRow[], hospitals: { id: string; name: string }[], viewerRole: string }) {
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [localProfiles, setLocalProfiles] = useState(profiles)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const filtered = localProfiles.filter(p => {
    const name = p.full_name?.toLowerCase() || ""
    const matchesQuery = !query || name.includes(query.toLowerCase())
    const matchesRole = roleFilter === "all" || p.role === roleFilter
    return matchesQuery && matchesRole
  })

  // RLS can refuse a write by matching zero rows WITHOUT returning an
  // error (e.g. a role the viewer's policies may not write). Every update
  // therefore asks for the row back with .select() and treats "nothing
  // came back" as the failure it is — a silent no-op styled as success
  // is how admins end up believing a change happened when it did not.
  const handleRoleChange = async (profileId: string, newRole: string) => {
    setUpdatingId(profileId)
    setActionError(null)
    const { data, error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profileId)
      .select('id')
    if (error || !data || data.length === 0) {
      setActionError("The role change could not be saved. You may not have permission to change this user's role.")
    } else {
      setLocalProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: newRole } : p))
    }
    setUpdatingId(null)
  }

  const handleHospitalChange = async (profileId: string, newHospitalId: string) => {
    setUpdatingId(profileId)
    setActionError(null)
    const { data, error } = await supabase
      .from('profiles')
      .update({ hospital_id: newHospitalId || null })
      .eq('id', profileId)
      .select('id')
    if (error || !data || data.length === 0) {
      setActionError("The hospital change could not be saved. You may not have permission to change this user's hospital.")
    } else {
      setLocalProfiles(prev => prev.map(p => {
        if (p.id === profileId) {
          const hospital = hospitals.find(h => h.id === newHospitalId)
          return { ...p, hospital_id: newHospitalId, hospitals: hospital ? { name: hospital.name } : null }
        }
        return p
      }))
    }
    setUpdatingId(null)
  }

  // Options for a row's role dropdown: the assignable roles, minus
  // super_admin when the viewer is a hospital_admin (only a super_admin
  // may grant super_admin — the DB guard enforces the same rule), plus
  // the user's current role when it isn't assignable (e.g. 'doctor') so
  // the control can still display it truthfully.
  const roleOptionsFor = (currentRole?: string | null) => {
    const options = ASSIGNABLE_ROLES.filter(
      r => !(viewerRole === 'hospital_admin' && r === 'super_admin')
    )
    if (currentRole && !options.includes(currentRole)) options.push(currentRole)
    return options
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ALL_ROLES.map(r => (
              <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
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
                    No users match the current filter.
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
                      onValueChange={(val) => handleRoleChange(profile.id, val)}
                      disabled={updatingId === profile.id}
                    >
                      <SelectTrigger className="w-44 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptionsFor(profile.role).map(r => (
                          <SelectItem key={r} value={r} className="text-xs">{r.replace('_', ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-4">
                    <Select
                      value={profile.hospital_id || "none"}
                      onValueChange={(val) => handleHospitalChange(profile.id, val === "none" ? "" : val)}
                      disabled={updatingId === profile.id}
                    >
                      <SelectTrigger className="w-44 h-8 text-xs">
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
                  <td className="p-4 text-muted-foreground">
                    {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-4">
                    {updatingId === profile.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <UserCheck className="h-4 w-4 text-green-500" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t bg-muted/10 text-xs text-muted-foreground">
          {filtered.length} of {localProfiles.length} users shown
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Doctor accounts are created through signup and verification.
      </p>
    </div>
  )
}
