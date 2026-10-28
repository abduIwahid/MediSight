"use client"

import { useEffect } from "react"
import Link from "next/link"
import BrandMark from "@/components/shared/BrandMark"
import { Button } from "@/components/ui/button"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // The error is logged and its digest shown (QA Round 3, states
  // F-08): without the digest a user report cannot be matched to the
  // server log line.
  useEffect(() => {
    console.error("Application error:", error)
  }, [error])

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex items-center justify-center gap-2.5">
          <BrandMark className="h-10 w-10 shrink-0" />
          <span className="text-xl font-bold tracking-tight">WhyRisk</span>
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            An unexpected error occurred. You can try again, or return home.
          </p>
          {error.digest && (
            <p className="font-mono text-[11px] text-muted-foreground">Reference: {error.digest}</p>
          )}
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/welcome">Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
