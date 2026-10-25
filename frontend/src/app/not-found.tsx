import Link from "next/link"
import BrandMark from "@/components/shared/BrandMark"
import { Button } from "@/components/ui/button"

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
        <Button asChild>
          <Link href="/welcome">Back to home</Link>
        </Button>
      </div>
    </div>
  )
}
