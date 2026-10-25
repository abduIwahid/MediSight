"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { DataTable } from "@/components/shared/DataTable"
import { EmptyState } from "@/components/shared/EmptyState"
import { RiskBadge } from "@/components/shared/RiskBadge"
import Link from "next/link"
import { Plus, Search, Trash2, UserSearch } from "lucide-react"
import { Input } from "@/components/ui/input"
import { motion, AnimatePresence, type Variants } from "framer-motion"
import type { PatientRow } from "@/lib/types"

// Get patient display name from demographics JSONB — handles multiple field name conventions
function getPatientName(p: PatientRow): string {
  const d = p.demographics
  if (!d) return "—"
  // Handle full_name or name field
  if (d.full_name) return d.full_name
  if (d.name) return d.name
  // Handle split first/last (camelCase or snake_case)
  const first = d.first_name || d.firstName || ""
  const last = d.last_name || d.lastName || ""
  const full = `${first} ${last}`.trim()
  return full || "—"
}

function getAge(p: PatientRow): string {
  const d = p.demographics
  if (!d) return "—"
  if (d.age) return String(d.age)
  // Derive from birth_date if age missing
  const dobRaw = d.birth_date || d.dob
  if (dobRaw) {
    const dob = new Date(dobRaw)
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    return String(age)
  }
  return "—"
}

function getGender(p: PatientRow): string {
  const d = p.demographics
  if (!d) return "—"
  const g = d.gender || ""
  return g ? g.charAt(0).toUpperCase() + g.slice(1).toLowerCase() : "—"
}

function getLatestSeverity(p: PatientRow): string | null {
  const preds = p.predictions || []
  if (preds.length === 0) return null
  const sorted = [...preds].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  return sorted[0]?.severity || null
}

interface PatientListViewProps {
  patients: PatientRow[]
  initialSearch?: string
  isAdmin?: boolean
}

export function PatientListView({ patients, initialSearch = "", isAdmin = false }: PatientListViewProps) {
  const [query, setQuery] = useState(initialSearch)
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDeletePatient = async (patientId: string) => {
    if (!window.confirm('Delete this patient record? This action cannot be undone.')) return
    setDeleteError(null)
    setDeletingId(patientId)

    // .select() verification: an RLS-refused delete returns no error and
    // zero rows — without the row check it would look like success.
    const { data: deleted, error } = await supabase.from('patients').delete().eq('id', patientId).select('id')
    if (error || !deleted || deleted.length === 0) {
      if (error) console.error("Patient delete failed:", error)
      setDeleteError("This patient record could not be deleted. You may not have permission, or the record is linked to other data.")
      setDeletingId(null)
      return
    }

    router.refresh()
  }

  // The registry's own search box runs the SAME server search as the
  // header (which routes to /patients?search=): submitting — or pausing
  // typing — re-queries the server, so patients beyond the 25 most
  // recent records are findable from this page too. The local filter
  // still refines the rows on screen while typing.
  const searchDebounce = useRef<number | null>(null)
  const routeToSearch = (term: string) => {
    const t = term.trim()
    if (t === initialSearch) return
    router.push(t ? `/patients?search=${encodeURIComponent(t)}` : "/patients")
  }
  const handleSearchChange = (value: string) => {
    setQuery(value)
    if (searchDebounce.current) window.clearTimeout(searchDebounce.current)
    searchDebounce.current = window.setTimeout(() => routeToSearch(value), 600)
  }

  useEffect(() => {
    setQuery(initialSearch)
  }, [initialSearch])

  const normalizedPatients = useMemo(() => {
    const seen = new Set<string>()
    return patients.filter((patient) => {
      if (!patient?.id || seen.has(patient.id)) return false
      seen.add(patient.id)
      return true
    })
  }, [patients])

  const filtered = useMemo(() => {
    if (!query.trim()) return normalizedPatients
    const q = query.toLowerCase()
    return normalizedPatients.filter(p => {
      const name = getPatientName(p).toLowerCase()
      const mrn = (p.mrn || "").toLowerCase()
      return name.includes(q) || mrn.includes(q)
    })
  }, [normalizedPatients, query])

  const columns = [
    {
      // Name leads: in a scanning (Markings) pattern the fixated first
      // column must carry the key identifier, with MRN as the reference.
      header: "Patient Name",
      cell: (p: PatientRow) => {
        const name = getPatientName(p)
        return (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
              <span className="text-xs font-semibold text-primary">
                {name !== "—" ? name.charAt(0).toUpperCase() : "?"}
              </span>
            </div>
            <span className="font-medium">{name}</span>
          </div>
        )
      }
    },
    {
      header: "MRN",
      cell: (p: PatientRow) => (
        <span className="font-mono text-xs text-muted-foreground">{p.mrn}</span>
      )
    },
    {
      header: "Age",
      cell: (p: PatientRow) => <span className="text-sm">{getAge(p)}</span>
    },
    {
      header: "Gender",
      cell: (p: PatientRow) => <span className="text-sm">{getGender(p)}</span>
    },
    {
      header: "Hospital",
      cell: (p: PatientRow) => (
        <span className="text-xs text-muted-foreground">{p.hospitals?.name || "—"}</span>
      )
    },
    {
      header: "Risk Status",
      cell: (p: PatientRow) => {
        const severity = getLatestSeverity(p)
        const preds = p.predictions || []
        const latest = preds.length > 0 ? [...preds].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0] : null
        if (severity) {
          return (
            <div className="flex flex-col gap-0.5">
              <RiskBadge severity={severity} />
              {latest?.disease && <span className="text-[10px] text-muted-foreground">{latest.disease}</span>}
            </div>
          )
        }
        return (
          <Link href={`/patients/new`} className="text-xs text-primary hover:underline">
            Run AI Prediction
          </Link>
        )
      }
    },
    {
      header: "Actions",
      cell: (p: PatientRow) => (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/patients/${p.id}`} className="text-sm font-medium text-primary hover:underline">
            View
          </Link>
          {isAdmin && (
            <button
              type="button"
              onClick={() => handleDeletePatient(p.id)}
              disabled={deletingId === p.id}
              className="text-sm text-destructive underline disabled:cursor-not-allowed disabled:text-destructive/50"
            >
              {deletingId === p.id ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      )
    }
  ]

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  }

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-7xl mx-auto pb-8"
    >
      {deleteError && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive shadow-sm flex items-center gap-3"
        >
          <Trash2 className="h-4 w-4 flex-shrink-0" />
          <p>{deleteError}</p>
        </motion.div>
      )}

      <motion.div variants={itemVariants} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Patient Registry</h1>
          <p className="mt-1.5 text-sm text-muted-foreground/80">
            {initialSearch ? (
              <>Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {normalizedPatients.length} records matching &ldquo;{initialSearch}&rdquo;.</>
            ) : (
              <>Monitoring <span className="font-semibold text-foreground">{filtered.length}</span> of {normalizedPatients.length} recent patient records.</>
            )}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <form
            className="relative group"
            onSubmit={(e) => {
              e.preventDefault()
              if (searchDebounce.current) window.clearTimeout(searchDebounce.current)
              routeToSearch(query)
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
              placeholder="Search by name or MRN..."
              value={query}
              onChange={e => handleSearchChange(e.target.value)}
              aria-label="Search patients by name or MRN"
              className="pl-9 h-11 w-full sm:w-64 rounded-xl border-border/50 bg-card shadow-sm transition-all focus:bg-background focus-visible:ring-1 focus-visible:ring-primary"
            />
          </form>
          <Link href="/patients/new" prefetch={true} className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" />
            New Assessment
          </Link>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="overflow-hidden rounded-2xl border bg-card shadow-sm hover:shadow-md transition-shadow duration-300">
        <AnimatePresence mode="wait">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4"
            >
              <EmptyState
                icon={UserSearch}
                title="No patients found"
                description="No records match the current view. Clear the search, or register a patient and run their first assessment."
                actionLabel="Add patient"
                actionHref="/patients/new"
              />
            </motion.div>
          ) : (
            <motion.div 
              key="table"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="overflow-x-auto custom-scrollbar"
            >
              <div className="min-w-[800px]">
                <DataTable columns={columns} data={filtered} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
