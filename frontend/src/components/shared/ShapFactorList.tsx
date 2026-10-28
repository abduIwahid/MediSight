"use client"

import { useMemo } from "react"
import { formatShapFactorLabel } from "@/lib/feature-labels"

export interface ShapFeature {
  feature: string
  value: string | number
  impact: number
}

interface ShapFactorListProps {
  data: ShapFeature[]
}

/**
 * The explanation as the primary visual: one row per factor, a signed bar
 * diverging from a centre zero line — amber pushes the risk up, green pulls
 * it down — with the exact SHAP value in mono on the right. Matches the
 * landing page's "Why this score" card language.
 *
 * Factor names and values render through lib/feature-labels: clinicians
 * see "Age group (65–69)", never the raw BRFSS code "Age (10)".
 *
 * The payload comes from a jsonb column whose schema default is an
 * object ({}), so a non-array value must degrade to the "not recorded"
 * state — spreading a plain object here used to crash the whole detail
 * page and print report (QA Round 2, cluster 9).
 */
export function ShapFactorList({ data }: ShapFactorListProps) {
  const rows = useMemo(() => {
    if (!Array.isArray(data)) return []
    const valid = data.filter(
      (item) => item && typeof item.feature === "string" && Number.isFinite(Number(item.impact))
    )
    const sorted = [...valid]
      .sort((a, b) => Math.abs(Number(b.impact)) - Math.abs(Number(a.impact)))
      .slice(0, 10)
    const maxAbs = Math.max(...sorted.map((d) => Math.abs(Number(d.impact))), 0.0001)
    return sorted.map((item) => ({
      ...item,
      impact: Number(item.impact),
      label: formatShapFactorLabel(item.feature, item.value),
      pct: (Math.abs(Number(item.impact)) / maxAbs) * 50,
    }))
  }, [data])

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No factor contributions were recorded for this prediction.</p>
  }

  return (
    <div>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-1 text-[13px] print:break-inside-avoid sm:flex-row sm:items-center sm:gap-3">
            <span className="w-full shrink-0 text-foreground/80 sm:w-44 sm:truncate print:whitespace-normal print:overflow-visible" title={row.label}>
              {row.label}
            </span>
            <span className="relative h-[9px] flex-1 overflow-hidden rounded-full bg-secondary">
              <span className="absolute left-1/2 top-0 h-full w-px bg-foreground/15" />
              {row.impact >= 0 ? (
                <span
                  className="absolute top-0 h-full rounded-r-full bg-[#D97706]"
                  style={{ left: "50%", width: `${row.pct}%` }}
                />
              ) : (
                <span
                  className="absolute top-0 h-full rounded-l-full bg-[#1E7A46]"
                  style={{ right: "50%", width: `${row.pct}%` }}
                />
              )}
            </span>
            <span className="w-14 shrink-0 font-mono text-[11.5px] sm:text-right">
              {row.impact > 0 ? "+" : ""}
              {row.impact.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex gap-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#D97706]" /> Increases risk
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#1E7A46]" /> Decreases risk
        </span>
      </div>
    </div>
  )
}
