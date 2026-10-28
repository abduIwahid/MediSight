"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

// Segment error boundary (QA Round 3, states F-08): an error inside
// a dashboard page keeps the shell visible and offers an in-place
// retry instead of replacing the whole app with the root boundary.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Dashboard page error:", error)
  }, [error])

  return (
    <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-6">
      <h2 className="font-heading text-lg font-bold text-foreground">This page could not be loaded</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Something went wrong while loading this page. Your other pages are unaffected — try again, or use the
        sidebar to go elsewhere.
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
