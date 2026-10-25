interface PulseLoaderProps {
  /** Show the Anton "WhyRisk." wordmark under the pulse. Default true. */
  showWordmark?: boolean
  /** Show the mono "Loading" label under the wordmark. Default true. */
  showLabel?: boolean
  /** Accessible name for the loading region, e.g. "Loading doctors". Default "Loading". */
  label?: string
  className?: string
}

/**
 * The Signature Flow loader — the brand pulse from the app icon, animated
 * as one 2.4s heartbeat: the full trace sits faint, a bright beat segment
 * travels it without stopping, and the landing dot thumps (one strong
 * beat, one soft answer) each time the beat arrives.
 *
 * Stroke/fill use the stroke-brand / fill-brand utilities, so colours come
 * from the --brand token and follow the light/dark theme automatically
 * (#2E7FA8 on paper, #5EA8C9 on ink). Keyframes (pulse-beat / pulse-dot /
 * pulse-label) live in globals.css; under prefers-reduced-motion the trace
 * and dot render statically. Dependency-light like EmptyState, so it can
 * render from server components and loading.tsx.
 */
export function PulseLoader({
  showWordmark = true,
  showLabel = true,
  label = "Loading",
  className = "",
}: PulseLoaderProps) {
  return (
    <div
      className={`flex flex-col items-center ${className}`}
      role="status"
      aria-label={label}
    >
      <svg
        viewBox="0 0 230 100"
        className="w-[250px] max-w-full"
        aria-hidden="true"
      >
        <path
          d="M8 58 H70 L84 32 L102 88 L122 10 L138 58 H192"
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-brand"
          opacity={0.22}
        />
        <path
          d="M8 58 H70 L84 32 L102 88 L122 10 L138 58 H192"
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
          className="pulse-beat stroke-brand"
        />
        <circle cx={206} cy={58} r={6} className="pulse-dot fill-brand" />
      </svg>
      {showWordmark && (
        <p className="mt-[26px] font-display text-[1.9rem] leading-none">
          WhyRisk<span className="text-brand">.</span>
        </p>
      )}
      {showLabel && (
        <p className="pulse-label mt-[10px] font-mono text-[0.66rem] font-medium uppercase tracking-[0.26em] text-muted-foreground">
          Loading
        </p>
      )}
    </div>
  )
}
