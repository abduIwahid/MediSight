"use client"

import { useState, useEffect } from "react"
import { AIChatPanel } from "@/components/shared/AIChatPanel"
import { createClient } from "@/lib/supabase/client"
import type { PatientRow } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function getPatientDisplayName(p: PatientRow): string {
  const d = p.demographics || {}
  if (d.full_name) return `${d.full_name} (MRN: ${p.mrn})`
  const first = d.first_name || d.firstName || ""
  const last = d.last_name || d.lastName || ""
  const name = `${first} ${last}`.trim()
  return name ? `${name} (MRN: ${p.mrn})` : `MRN: ${p.mrn}`
}

export default function AssistantPage() {
  const [patients, setPatients] = useState<PatientRow[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [patientSearch, setPatientSearch] = useState("")
  // Picker loading/error states (QA Round 3, states F-11): a failed
  // load used to present as an empty patient list.
  const [pickerLoading, setPickerLoading] = useState(true)
  const [pickerError, setPickerError] = useState(false)
  const supabase = createClient()

  // The picker is searchable (QA Round 1, item 61): with a full patient
  // panel, scrolling an unfiltered list to find one name is unusable.
  const visiblePatients = patients.filter((p) =>
    getPatientDisplayName(p).toLowerCase().includes(patientSearch.trim().toLowerCase())
  )

  useEffect(() => {
    const fetchPatients = async () => {
      setPickerLoading(true)
      setPickerError(false)
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('id, demographics, mrn')
          .order('created_at', { ascending: false })
          .limit(50)

        if (error) throw error
        setPatients(data ?? [])
      } catch (e) {
        console.error("Assistant patient list failed to load:", e)
        setPickerError(true)
      } finally {
        setPickerLoading(false)
      }
    }
    fetchPatients()
  }, [supabase])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Assistant</h1>
          <p className="text-muted-foreground">Conversational decision support grounded in patient data.</p>
        </div>
        <div className="w-full sm:w-[320px]">
          <Select
            value={selectedPatientId || "general"}
            onValueChange={(val) => setSelectedPatientId(val === "general" ? null : val)}
          >
            <SelectTrigger aria-label="Select patient context">
              <SelectValue placeholder="Select patient context" />
            </SelectTrigger>
            <SelectContent>
              <div className="sticky top-0 z-10 border-b bg-popover p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Search patients…"
                    aria-label="Search patients"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
              <SelectItem value="general">General / No Patient Selected</SelectItem>
              {visiblePatients.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {getPatientDisplayName(p)}
                </SelectItem>
              ))}
              {pickerLoading ? (
                <p role="status" className="px-3 py-2 text-xs text-muted-foreground">Loading patients…</p>
              ) : pickerError ? (
                <p role="alert" className="px-3 py-2 text-xs text-destructive-text">
                  Patients could not be loaded. Close and reopen to try again.
                </p>
              ) : visiblePatients.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {patients.length === 0 ? "No patients are registered yet." : "No patients match your search."}
                </p>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <AIChatPanel patientId={selectedPatientId} key={selectedPatientId || 'general'} />
    </div>
  )
}
