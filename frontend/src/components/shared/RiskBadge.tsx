import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { severityBadgeClass } from "@/lib/status"

export type RiskSeverity = 'Low' | 'Moderate' | 'High' | 'Critical' | 'Unknown'

export function RiskBadge({ severity, className }: { severity: RiskSeverity | string, className?: string }) {
  const safeSeverity = ['Low', 'Moderate', 'High', 'Critical'].includes(severity) ? (severity as RiskSeverity) : 'Unknown'

  /* Semantic data colours only: green = low/positive, amber = moderate,
     red = high/critical — defined once in lib/status.ts (Moderate text
     is #A85008: #B45309 measured 4.47:1 on the tint, below the 4.5:1
     small-text floor; #A85008 measures 4.89:1). */
  const colorMap = severityBadgeClass

  return (
    <Badge variant="outline" className={cn("border-transparent", colorMap[safeSeverity], className)}>
      {severity}
    </Badge>
  )
}
