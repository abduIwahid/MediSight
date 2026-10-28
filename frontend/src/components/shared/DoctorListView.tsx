"use client"

import Image from "next/image"
import Link from "next/link"
import { DataTable } from "@/components/shared/DataTable"
import { EmptyState } from "@/components/shared/EmptyState"
import { Stethoscope, MapPin, Phone, Mail } from "lucide-react"
import { availabilityInfo } from "@/lib/status"

function doctorName(doctor: DoctorListRow): string {
  if (doctor.first_name && doctor.last_name) return `${doctor.first_name} ${doctor.last_name}`
  return doctor.full_name || 'Doctor'
}

function doctorInitials(doctor: DoctorListRow): string {
  const parts = doctorName(doctor).split(" ").filter(Boolean)
  return (parts.map((p) => p[0]).slice(0, 2).join("") || "D").toUpperCase()
}

interface DoctorListRow {
  id: string
  avatar_url?: string | null
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  specialty?: string | null
  email?: string | null
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
          {doctor.avatar_url ? (
            <Image
              src={doctor.avatar_url}
              alt={doctor.full_name || 'Doctor'}
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover border border-border flex-shrink-0"
            />
          ) : (
            // Brand initials tile — no third-party avatar hot-links.
            <div aria-hidden="true" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {doctorInitials(doctor)}
            </div>
          )}
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
      hideOnMobile: true,
      cell: (doctor: DoctorListRow) => (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> {doctor.hospitals?.name || "No hospital on file"}
        </div>
      )
    },
    {
      header: "Status",
      cell: (doctor: DoctorListRow) => {
        // ONE availability source: availability_status. An unset status
        // is labelled "Not set" — never an invented state.
        const s = availabilityInfo(doctor.availability_status)
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
        <span className="text-sm font-medium">{doctor.consultation_fee ? `Rs. ${Number(doctor.consultation_fee).toLocaleString()}` : "Not set"}</span>
      )
    },
    {
      header: "Contact",
      hideOnMobile: true,
      cell: (doctor: DoctorListRow) => (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {doctor.email && (
            <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{doctor.email}</span>
          )}
          {doctor.contact_number && (
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{doctor.contact_number}</span>
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
        <div className="overflow-hidden rounded-xl border bg-card shadow-card overflow-x-auto">
          {/* No min-w wrapper (QA Round 2, cluster 28): the table fits
              360px because Hospital + Contact hide below sm — Doctor,
              Status and Fee stay visible. */}
          <DataTable columns={columns} data={doctors} />
        </div>
      )}
    </div>
  )
}
