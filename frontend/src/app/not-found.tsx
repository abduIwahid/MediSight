import Link from "next/link"
import type { Metadata } from "next"
import BrandMark from "@/components/shared/BrandMark"

// A real document title for the 404 (QA Round 3, SEO L3).
export const metadata: Metadata = { title: "Page not found" }

export default function NotFound() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex items-center justify-center gap-2.5">
          <BrandMark className="h-10 w-10 shrink-0" />
          <span className="text-xl font-bold tracking-tight">WhyRisk</span>
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold text-foreground">Page not found</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has moved.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/welcome"
            className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-card transition-all duration-200 hover:bg-primary/90 hover:shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Back to home
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-all duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
