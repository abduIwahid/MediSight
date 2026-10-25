"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Clock, XCircle, LogOut, HelpCircle } from "lucide-react"
import BrandMark from "@/components/shared/BrandMark"
import { PulseLoader } from "@/components/shared/PulseLoader"

export default function PendingApprovalPage() {
  const [status, setStatus] = useState<"pending" | "rejected" | "none" | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }
      const { data: doctor } = await supabase.from("doctors").select("status").eq("user_id", user.id).single()
      if (doctor?.status === "approved") {
        router.push("/dashboard")
        return
      }
      // A missing doctors row is NOT "pending" — this page used to call
      // every missing row pending, including accounts that never applied
      // (QA Round 1, item 64).
      setStatus(doctor ? (doctor.status as "pending" | "rejected") : "none")
      setLoading(false)
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

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 bg-muted/30 px-4 py-10">
      <div className="flex items-center gap-2.5">
        <BrandMark className="h-10 w-10 shrink-0" />
        <span className="text-xl font-bold tracking-tight">WhyRisk</span>
      </div>
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${isRejected ? "bg-destructive/10 text-destructive" : isNone ? "bg-secondary text-primary" : "bg-[#FDF0DC] text-[#A85008]"}`}>
          {isRejected ? <XCircle className="h-7 w-7" /> : isNone ? <HelpCircle className="h-7 w-7" /> : <Clock className="h-7 w-7" />}
        </div>

        {isRejected ? (
          <>
            <h1 className="text-xl font-bold">Registration Not Approved</h1>
            <p className="text-sm text-muted-foreground">
              Your doctor registration has been rejected. Please contact the administrator for more information.
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

        <Button variant="outline" className="w-full gap-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  )
}
