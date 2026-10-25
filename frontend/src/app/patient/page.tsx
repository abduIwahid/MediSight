import { redirect } from "next/navigation"

// The patient portal's home is its dashboard — the bare /patient path
// just forwards there.
export default function PatientIndexPage() {
  redirect("/patient/dashboard")
}
