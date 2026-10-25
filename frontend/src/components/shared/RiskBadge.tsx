import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type RiskSeverity = 'Low' | 'Moderate' | 'High' | 'Critical' | 'Unknown'

export function RiskBadge({ severity, className }: { severity: RiskSeverity | string, className?: string }) {
  const safeSeverity = ['Low', 'Moderate', 'High', 'Critical'].includes(severity) ? (severity as RiskSeverity) : 'Unknown'

  /* Semantic data colours only: green = low/positive, amber = moderate,
     red = high/critical. */
  const colorMap: Record<RiskSeverity | 'Unknown', string> = {
    Low: "bg-[#E2F0E6] text-[#1E7A46] hover:bg-[#E2F0E6]/80 dark:bg-[#1E7A46]/20 dark:text-[#7BC79B]",
    Moderate: "bg-[#FDF0DC] text-[#B45309] hover:bg-[#FDF0DC]/80 dark:bg-[#D97706]/20 dark:text-[#E8A94E]",
    High: "bg-[#FAE9E7] text-[#C0392B] hover:bg-[#FAE9E7]/80 dark:bg-[#C0392B]/20 dark:text-[#E88A7E]",
    Critical: "bg-[#C0392B] text-white hover:bg-[#C0392B]/90 font-bold",
    Unknown: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  }

  return (
    <Badge variant="outline" className={cn("border-transparent", colorMap[safeSeverity], className)}>
      {severity}
    </Badge>
  )
}
