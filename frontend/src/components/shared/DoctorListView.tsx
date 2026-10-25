"use client"

import Link from "next/link"
import { DataTable } from "@/components/shared/DataTable"
import { EmptyState } from "@/components/shared/EmptyState"
import { Stethoscope, MapPin, Phone, Mail } from "lucide-react"

interface DoctorListRow {
  id: string
  avatar_url?: string | null
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  specialty?: string | null
  email?: string | null
  phone?: string | null
  contact_number?: string | null
  consultation_fee?: number | null
  available?: boolean | null
  availability_status?: string | null
  hospitals?: { name: string } | null
}

interface DoctorListViewProps {
  doctors: DoctorListRow[]
}

export function DoctorListView({ doctors }: DoctorListViewProps) {
  const columns = [
    {
      header: "Doctor",
      cell: (doctor: DoctorListRow) => (
        <div className="flex items-center gap-3">
          <img
            src={doctor.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent((doctor.first_name || doctor.full_name || 'D') + ' ' + (doctor.last_name || ''))}&background=1d4ed8&color=fff&size=64&rounded=true`}
            alt={doctor.full_name || 'Doctor'}
            className="h-9 w-9 rounded-full object-cover border border-border flex-shrink-0"
          />
          <div className="space-y-0.5">
            <div className="font-semibold text-sm">
              {doctor.first_name && doctor.last_name
                ? `${doctor.first_name} ${doctor.last_name}`
                : (doctor.full_name || '—')}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Stethoscope className="h-3 w-3" /> {doctor.specialty || '—'}
            </div>
          </div>
        </div>
      )
    },
    {
      header: "Hospital",
      cell: (doctor: DoctorListRow) => (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> {doctor.hospitals?.name || "Independent"}
        </div>
      )
    },
    {
      header: "Status",
      cell: (doctor: DoctorListRow) => {
        const status = doctor.availability_status || (doctor.available ? 'available' : 'busy')
        const map: Record<string, { label: string; className: string }> = {
          available: { label: 'Available', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' },
          busy:      { label: 'Busy',      className: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
          on_leave:  { label: 'On Leave',  className: 'bg-slate-500/10 text-slate-600 border-slate-500/20' },
        }
        const s = map[status] || map['busy']
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.className}`}>
            {s.label}
          </span>
        )
      }
    },
    {
      header: "Fee (PKR)",
      cell: (doctor: DoctorListRow) => (
        <span className="text-sm font-medium">{doctor.consultation_fee ? `Rs. ${Number(doctor.consultation_fee).toLocaleString()}` : "TBD"}</span>
      )
    },
    {
      header: "Contact",
      cell: (doctor: DoctorListRow) => (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {doctor.email && (
            <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{doctor.email}</span>
          )}
          {(doctor.contact_number || doctor.phone) && (
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{doctor.contact_number || doctor.phone}</span>
          )}
        </div>
      )
    },
    {
      header: "",
      cell: (doctor: DoctorListRow) => (
        <Link href={`/doctors/${doctor.id}`} className="text-sm font-medium text-primary hover:underline">
          View Profile
        </Link>
      )
    }
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Doctor Directory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse vetted doctors and specialists available through WhyRisk.
          </p>
        </div>
      </div>
      {doctors.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No doctors in the directory yet"
          description="Approved doctor profiles will appear here. New sign-ups wait for admin approval before they are listed."
          actionLabel="Review doctor approvals"
          actionHref="/admin/doctors"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm overflow-x-auto">
          <div className="min-w-[800px]">
            <DataTable columns={columns} data={doctors} />
          </div>
        </div>
      )}
    </div>
  )
}
