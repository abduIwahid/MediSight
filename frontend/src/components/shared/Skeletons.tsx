/**
 * Structure-aware loading skeletons for the main app routes
 * (features round, 2026-10-30). Each route's loading.tsx composes
 * these blocks so the placeholder has the same shape as the page that
 * replaces it — title, stat cards, table, list — instead of a spinner
 * floating in an empty shell. Same visual language as the dashboard
 * skeleton that predates them: bg-secondary pulse blocks on cards.
 */

export function PageTitleSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div>
      <div className="h-8 w-56 max-w-full animate-pulse rounded bg-secondary" />
      <div className={`mt-2 h-4 animate-pulse rounded bg-secondary/70 ${wide ? "w-[420px]" : "w-72"} max-w-full`} />
    </div>
  )
}

export function FilterChipsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-secondary" />
      ))}
    </div>
  )
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-5">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-secondary" />
          <div className="mt-3 h-3 w-20 animate-pulse rounded bg-secondary" />
          <div className="mt-2 h-6 w-16 animate-pulse rounded bg-secondary" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b bg-secondary/50 px-4 py-3">
        <div className="h-4 w-40 animate-pulse rounded bg-secondary" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="h-4 w-1/4 animate-pulse rounded bg-secondary/80" />
            <div className="h-4 w-1/6 animate-pulse rounded bg-secondary/60" />
            <div className="h-4 w-1/6 animate-pulse rounded bg-secondary/60" />
            <div className="ml-auto h-6 w-16 animate-pulse rounded-full bg-secondary" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ListSkeleton({ rows = 5, tall = false }: { rows?: number; tall?: boolean }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`rounded-xl border bg-card p-5 ${tall ? "py-6" : ""}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="w-full space-y-2">
              <div className="h-4 w-48 max-w-full animate-pulse rounded bg-secondary" />
              <div className="h-3 w-72 max-w-full animate-pulse rounded bg-secondary/60" />
            </div>
            <div className="h-6 w-20 shrink-0 animate-pulse rounded-full bg-secondary" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PanelSkeleton({
  lines = 4,
  className = "",
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={`rounded-xl border bg-card p-6 ${className}`}>
      <div className="h-4 w-40 animate-pulse rounded bg-secondary" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-secondary/70" />
        ))}
      </div>
    </div>
  )
}

export function ActionCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-6">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-secondary" />
          <div className="space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-44 animate-pulse rounded bg-secondary/60" />
          </div>
        </div>
      ))}
    </div>
  )
}
