"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Clock, XCircle, LogOut, HelpCircle } from "lucide-react"
import BrandMark from "@/components/shared/BrandMark"
import { PulseLoader } from "@/components/shared/PulseLoader"

export default function PendingApprovalPage() {
  const [status, setStatus] = useState<"pending" | "rejected" | "none" | "error" | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      // A failed status query must not be reported as "no application"
      // (QA Round 3, states F-10 / onboarding O-13): only a confirmed
      // zero-row answer (PGRST116) means there is no application.
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push("/login")
          return
        }
        const { data: doctor, error } = await supabase.from("doctors").select("status").eq("user_id", user.id).single()
        if (error && error.code !== "PGRST116") {
          console.error("Doctor status check failed:", error)
          setStatus("error")
          return
        }
        if (doctor?.status === "approved") {
          router.push("/dashboard")
          return
        }
        // A missing doctors row is NOT "pending" — this page used to call
        // every missing row pending, including accounts that never applied
        // (QA Round 1, item 64).
        setStatus(doctor ? (doctor.status as "pending" | "rejected") : "none")
      } catch (err) {
        console.error("Doctor status check failed:", err)
        setStatus("error")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (loading) return <div className="flex h-dvh items-center justify-center"><PulseLoader label="Checking your application status" /></div>

  const isRejected = status === "rejected"
  const isNone = status === "none"
  const isError = status === "error"

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 bg-muted/30 px-4 py-10">
      <div className="flex items-center gap-2.5">
        <BrandMark className="h-10 w-10 shrink-0" />
        <span className="text-xl font-bold tracking-tight">WhyRisk</span>
      </div>
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 text-center shadow-card">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${isRejected ? "bg-destructive/10 text-destructive-text" : isNone ? "bg-secondary text-primary" : "bg-[#FDF0DC] text-[#A85008]"}`}>
          {isRejected ? <XCircle className="h-7 w-7" /> : isNone ? <HelpCircle className="h-7 w-7" /> : <Clock className="h-7 w-7" />}
        </div>

        {isError ? (
          <>
            <h1 className="text-xl font-bold">Status Could Not Be Checked</h1>
            <p className="text-sm text-muted-foreground">
              Your application status could not be checked just now. Please reload the page to try again — this does not change your application.
            </p>
            <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </>
        ) : isRejected ? (
          <>
            <h1 className="text-xl font-bold">Registration Not Approved</h1>
            <p className="text-sm text-muted-foreground">
              Your doctor registration has been rejected. If you believe this was a mistake, or your credentials have changed, contact the clinic administrator and ask them to re-open your application in Doctor Verification.
            </p>
          </>
        ) : isNone ? (
          <>
            <h1 className="text-xl font-bold">No Doctor Application Found</h1>
            <p className="text-sm text-muted-foreground">
              There is no doctor application linked to this account. If you signed up as a doctor, please contact the
              administrator so your application can be checked.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Awaiting Administrator Approval</h1>
            <p className="text-sm text-muted-foreground">
              Your account has been created successfully. It is currently awaiting administrator approval before you can
              access the Doctor Portal. Please sign in again after some time to check your status.
            </p>
          </>
        )}

        {(isRejected || isNone) && (
          <p className="text-sm text-muted-foreground">
            Questions about your application? Email us at{" "}
            <a href="mailto:contact@abdulwahid.me" className="font-medium text-primary underline underline-offset-2">
              contact@abdulwahid.me
            </a>
            .
          </p>
        )}

        <Button variant="outline" className="w-full gap-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  )
}
