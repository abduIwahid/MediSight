import type { PredictionRow } from "@/lib/types"
import { severityChartColor } from "@/lib/status"

// Trend dots use the canonical severity fills from lib/status.ts.
const SEVERITY_DOT = severityChartColor

function fmtShortDate(iso?: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: "Asia/Karachi" })
}

function fmtFullDate(iso?: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Karachi" })
}

/**
 * The patient's stored assessment scores over time — a plain SVG line
 * chart in the 2A language (brand stroke, severity-coloured points, no
 * chart library). Every point is a real stored prediction; nothing is
 * interpolated or smoothed beyond the connecting line.
 */
export function RiskTrendChart({ predictions }: { predictions: PredictionRow[] }) {
  const points = [...predictions]
    .filter((p) => typeof p.probability === "number")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  if (points.length < 2) return null

  const W = 340
  const H = 150
  const PAD = { top: 12, right: 10, bottom: 22, left: 30 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  // The x axis is TIME-scaled (QA Round 3, prediction-print M5):
  // points used to be spaced by index, so two assessments a day apart
  // and two a month apart sat the same distance apart and same-day
  // runs overlapped into one dot.
  const t0 = new Date(points[0].created_at).getTime()
  const t1 = new Date(points[points.length - 1].created_at).getTime()
  const span = Math.max(1, t1 - t0)
  const coords = points.map((p) => {
    const x = PAD.left + ((new Date(p.created_at).getTime() - t0) / span) * innerW
    const y = PAD.top + (1 - (p.probability ?? 0)) * innerH
    return { x, y, p }
  })

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ")
  const area = `${PAD.left},${PAD.top + innerH} ${polyline} ${PAD.left + innerW},${PAD.top + innerH}`
  const first = points[0]
  const last = points[points.length - 1]
  const deltaPts = ((last.probability ?? 0) - (first.probability ?? 0)) * 100

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Risk score trend over time">
        {[0, 0.5, 1].map((v) => {
          const y = PAD.top + (1 - v) * innerH
          return (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y} stroke="#CCD0CF" strokeWidth={v === 0 ? 1.2 : 0.6} strokeDasharray={v === 0 ? "" : "3 3"} />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="11" fill="#5A6B73" fontFamily="JetBrains Mono, monospace">
                {v * 100}
              </text>
            </g>
          )
        })}
        <polygon points={area} fill="#2E7FA8" opacity={0.08} />
        <polyline points={polyline} fill="none" stroke="#2E7FA8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={4} fill={c.p.severity ? (SEVERITY_DOT[c.p.severity] ?? "#5A6B73") : "#5A6B73"} stroke="#fff" strokeWidth={1.5}>
            <title>{`${fmtFullDate(c.p.created_at)} — ${((c.p.probability ?? 0) * 100).toFixed(1)}% (${c.p.severity ?? "severity not recorded"})`}</title>
          </circle>
        ))}
        <text x={PAD.left} y={H - 6} fontSize="11" fill="#5A6B73" fontFamily="JetBrains Mono, monospace">
          {fmtShortDate(first.created_at)}
        </text>
        <text x={PAD.left + innerW} y={H - 6} textAnchor="end" fontSize="11" fill="#5A6B73" fontFamily="JetBrains Mono, monospace">
          {fmtShortDate(last.created_at)}
        </text>
      </svg>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {points.length} assessments · latest {((last.probability ?? 0) * 100).toFixed(1)}% on {fmtFullDate(last.created_at)} ·{" "}
        <span style={{ color: deltaPts < 0 ? "#1E7A46" : deltaPts > 0 ? "#C0392B" : undefined }} className="font-mono font-semibold">
          {deltaPts > 0 ? "+" : ""}
          {deltaPts.toFixed(1)} pts
        </span>{" "}
        since the first assessment.
      </p>
    </div>
  )
}
