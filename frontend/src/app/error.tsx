"use client"

import Link from "next/link"
import BrandMark from "@/components/shared/BrandMark"
import { Button } from "@/components/ui/button"

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
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
