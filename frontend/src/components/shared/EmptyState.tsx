import Link from "next/link"
import type { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  className?: string
}

/**
 * The one empty-state pattern for the app (per the saved empty-states
 * reference): a specific icon, a heading that names what is missing, one
 * line explaining why / what happens next, and a single primary action.
 * No illustration, no second button, no generic "No data found".
 *
 * Deliberately dependency-light (no UI primitives) so it can render from
 * both server and client components.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center ${className}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary">
        <Icon className="h-7 w-7 text-primary" />
      </div>
      <h2 className="mt-4 font-sans text-lg font-bold tracking-normal">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
