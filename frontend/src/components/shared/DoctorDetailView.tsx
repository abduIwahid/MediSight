"use client"

import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ArrowLeft, MapPin, Phone, Mail, CheckCircle2 } from "lucide-react"
import { availabilityInfo } from "@/lib/status"

function initialsOf(name: string): string {
  return (name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("") || "D").toUpperCase()
}

// The availability sentence says only what the recorded status says.
function availabilitySentence(status?: string | null): string {
  switch (status) {
    case "available":
      return "Available for new consultations and follow-ups."
    case "busy":
      return "Currently busy — not taking new bookings right now."
    case "on_leave":
      return "On leave — not taking new bookings right now."
    default:
      return "Availability has not been set for this doctor yet."
  }
}

export interface DoctorDetailRow {
  id?: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  avatar_url?: string | null
  specialty?: string | null
  bio?: string | null
  email?: string | null
  contact_number?: string | null
  consultation_fee?: number | null
  available?: boolean | null
  availability_status?: string | null
  services?: string[] | null
  hospitals?: { name: string } | null
}

interface DoctorDetailViewProps {
  doctor: DoctorDetailRow
}

export function DoctorDetailView({ doctor }: DoctorDetailViewProps) {
  const displayName = doctor.first_name && doctor.last_name
    ? `${doctor.first_name} ${doctor.last_name}`
    : (doctor.full_name || doctor.name || 'Doctor')
  // ONE availability source: availability_status (never the legacy bool,
  // never an invented fallback state).
  const statusInfo = availabilityInfo(doctor.availability_status)
  const statusLabel = doctor.availability_status === "available" ? "Accepting Patients" : statusInfo.label

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
          <p className="text-sm text-muted-foreground mt-1">{doctor.specialty} • {doctor.hospitals?.name || "No hospital on file"}</p>
        </div>
        <Link href="/doctors">
          <Button variant="outline" className="h-10">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to doctors
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Doctor Profile</CardTitle>
            <CardDescription>Contact details and availability.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-3 pb-4 border-b">
              {doctor.avatar_url ? (
                <Image
                  src={doctor.avatar_url}
                  alt={displayName}
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-full object-cover border-2 border-primary/20 shadow-card"
                />
              ) : (
                // Brand initials tile — no third-party avatar hot-links.
                <div aria-hidden="true" className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-3xl font-bold text-primary-foreground">
                  {initialsOf(displayName)}
                </div>
              )}
              <div className="text-center">
                <p className="font-semibold text-base">{displayName}</p>
                <p className="text-xs text-muted-foreground">{doctor.specialty}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" /> {doctor.hospitals?.name || "No hospital on file"}
              </div>
              {doctor.contact_number && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" /> {doctor.contact_number}
                </div>
              )}
              {doctor.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" /> {doctor.email}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</span>
              <div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusInfo.className}`}>
                  {statusLabel}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Consultation Fee</span>
              <div className="text-lg font-semibold">{doctor.consultation_fee ? `Rs. ${Number(doctor.consultation_fee).toLocaleString()}` : "Not set"}</div>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>About {displayName}</CardTitle>
              <CardDescription>Specialty, services, and practice summary.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">{doctor.bio || "No biography added yet."}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border p-4 bg-muted/50">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Services</p>
                  <div className="space-y-2 text-sm">
                    {Array.isArray(doctor.services) && doctor.services.length > 0 ? (
                      doctor.services.map((service: string, index: number) => (
                        <div key={index} className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          <span>{service}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No services or specialties added yet.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border p-4 bg-muted/50">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Availability</p>
                  <p className="text-sm leading-6 text-muted-foreground">{availabilitySentence(doctor.availability_status)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
