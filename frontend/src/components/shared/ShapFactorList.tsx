"use client"

import { useMemo } from "react"

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
 */
export function ShapFactorList({ data }: ShapFactorListProps) {
  const rows = useMemo(() => {
    const sorted = [...data]
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
      .slice(0, 10)
    const maxAbs = Math.max(...sorted.map((d) => Math.abs(d.impact)), 0.0001)
    return sorted.map((item) => ({
      ...item,
      label: `${item.feature} (${item.value})`,
      pct: (Math.abs(item.impact) / maxAbs) * 50,
    }))
  }, [data])

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No factor contributions were returned for this prediction.</p>
  }

  return (
    <div>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 text-[13px]">
            <span className="w-44 shrink-0 truncate text-[#33454F]" title={row.label}>
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
            <span className="w-14 shrink-0 text-right font-mono text-[11.5px]">
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
