"use client"
import { Fragment, useState } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Search, ShieldCheck } from "lucide-react"
import type { AuditLogRow } from "@/lib/types"
import { roleLabel } from "@/lib/roles"
import { auditActionClass } from "@/lib/status"
import { fmtDateTime } from "@/lib/dates"

// Action chip colours live in lib/status.ts (the one palette).
const ACTION_COLORS = auditActionClass

// The database triggers log writes only — a SELECT filter could never
// match anything, so it is not offered (QA Round 1, item 58).
const ACTIONS = ["INSERT", "UPDATE", "DELETE"]
const PAGE_SIZE = 25

function formatValues(values?: Record<string, unknown> | null): string {
  if (!values) return "—"
  const entries = Object.entries(values).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return "—"
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ")
}

export function AuditLogView({ logs, loadError = false }: { logs: AuditLogRow[]; loadError?: boolean }) {
  const [query, setQuery] = useState("")
  const [actionFilter, setActionFilter] = useState("all")
  const [tableFilter, setTableFilter] = useState("all")
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const uniqueTables = [...new Set(logs.map(l => l.table_name))].sort()

  const filtered = logs.filter(l => {
    const actorName = l.profiles?.full_name?.toLowerCase() || ""
    const rowId = l.row_id?.toLowerCase() || ""
    const matchesQuery = !query || actorName.includes(query.toLowerCase()) || rowId.includes(query.toLowerCase()) || l.table_name.includes(query.toLowerCase())
    const matchesAction = actionFilter === "all" || l.action === actionFilter
    const matchesTable = tableFilter === "all" || l.table_name === tableFilter
    return matchesQuery && matchesAction && matchesTable
  })

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageLogs = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const resetPage = () => setPage(0)

  return (
    <div className="space-y-4">
      {loadError && (
        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          The audit trail could not be loaded, so entries below may be missing. Refresh the page to try again — an empty list here does not mean nothing happened.
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by actor, table, or row ID..."
            value={query}
            onChange={e => { setQuery(e.target.value); resetPage() }}
            className="pl-9"
            aria-label="Search audit logs"
          />
        </div>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); resetPage() }}>
          <SelectTrigger className="w-40" aria-label="Filter by action">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {ACTIONS.map(a => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tableFilter} onValueChange={(v) => { setTableFilter(v); resetPage() }}>
          <SelectTrigger className="w-48" aria-label="Filter by table">
            <SelectValue placeholder="Table" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tables</SelectItem>
            {uniqueTables.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">PHI Audit Trail</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} of {logs.length} entries
            {logs.length >= 200 ? " · most recent 200 shown" : ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium text-muted-foreground">Timestamp</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Actor</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Table</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Row ID</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Values</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No audit entries match the current filter.
                  </td>
                </tr>
              ) : pageLogs.map((log) => {
                const hasValues = Boolean(log.old_values || log.new_values)
                const expanded = expandedId === log.id
                return (
                  <Fragment key={log.id}>
                    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDateTime(log.created_at)}
                      </td>
                      <td className="p-3">
                        <div>
                          <p className="font-medium">{log.profiles?.full_name || "System"}</p>
                          <p className="text-xs text-muted-foreground">{log.profiles?.role ? roleLabel(log.profiles.role) : ""}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={`border ${ACTION_COLORS[log.action] || "bg-muted text-muted-foreground border-border"}`}>{log.action}</Badge>
                      </td>
                      <td className="p-3 font-mono text-xs">{log.table_name}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{log.row_id?.slice(0, 8)}…</td>
                      <td className="p-3">
                        {hasValues ? (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : log.id)}
                            aria-expanded={expanded}
                            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {expanded ? "Hide" : "Show"}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                    {expanded && hasValues && (
                      <tr className="border-b bg-muted/10">
                        <td colSpan={6} className="p-3 text-xs leading-relaxed text-muted-foreground">
                          <p><span className="font-semibold text-foreground">Before:</span> {formatValues(log.old_values)}</p>
                          <p className="mt-1"><span className="font-semibold text-foreground">After:</span> {formatValues(log.new_values)}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">Page {safePage + 1} of {pageCount}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
