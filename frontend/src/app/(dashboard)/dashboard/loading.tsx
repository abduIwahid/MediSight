export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="rounded-xl bg-primary p-6 sm:p-10">
        <div className="h-3 w-48 animate-pulse rounded bg-white/20" />
        <div className="mt-4 h-10 w-80 max-w-full animate-pulse rounded bg-white/25" />
        <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-white/15" />
        <div className="mt-6 flex gap-3">
          <div className="h-11 w-44 animate-pulse rounded-lg bg-white/20" />
          <div className="h-11 w-36 animate-pulse rounded-lg bg-white/10" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2.5">
                <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
                <div className="h-8 w-12 animate-pulse rounded bg-secondary" />
              </div>
              <div className="h-11 w-11 animate-pulse rounded-lg bg-secondary" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-6 lg:col-span-2">
          <div className="h-4 w-40 animate-pulse rounded bg-secondary" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary/70" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <div className="h-4 w-28 animate-pulse rounded bg-secondary" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-secondary/70" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
