"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

// Segment error boundary for the patient portal (QA Round 3, states
// F-08): keeps the portal shell visible and retries in place.
export default function PatientError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Patient portal page error:", error)
  }, [error])

  return (
    <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-6">
      <h2 className="font-heading text-lg font-bold text-foreground">This page could not be loaded</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Something went wrong while loading this page. Try again, or use the menu to go to another page.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">Reference: {error.digest}</p>
      )}
      <Button className="mt-4" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  )
}
