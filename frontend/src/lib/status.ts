/**
 * The ONE status + severity palette for the product (QA Round 1, item 8;
 * QA Round 2, cluster 26): appointment statuses, doctor availability AND
 * risk-severity colours all read from here. No local colour maps in
 * views — if a surface needs a severity colour, it imports it below.
 *
 * THE MODERATE RULE (the one place this is written down): Moderate TEXT
 * is #A85008 (deepened from #D97706 for the 4.5:1 small-text floor),
 * while Moderate FILLS — chart bars, gauge arcs, dots, borders — use
 * #D97706. Every other severity uses one hex for both text and fill:
 * Low #1E7A46, High #C0392B, Critical #C0392B, on the canonical tints
 * (#E2F0E6 / #FDF0DC / #FAE9E7).
 */

/** Canonical severity hexes for SVG/chart/inline-style contexts. */
export const SEVERITY_HEX = {
  Low: "#1E7A46",
  Moderate: "#D97706", // fill value — see the Moderate rule above
  High: "#C0392B",
  Critical: "#C0392B",
  Unknown: "#5A6B73",
} as const

/** Severity hexes for TEXT contexts — identical to SEVERITY_HEX except
 *  Moderate, whose text value is #A85008 (the Moderate rule above). */
export const SEVERITY_TEXT_HEX = {
  Low: "#1E7A46",
  Moderate: "#A85008",
  High: "#C0392B",
  Critical: "#C0392B",
  Unknown: "#5A6B73",
} as const

export type SeverityName = keyof typeof SEVERITY_HEX

/** Chart/SVG severity map (pie cells, gauge arcs, trend dots). */
export const severityChartColor: Record<string, string> = { ...SEVERITY_HEX }

/** Alert-status chart colours (Analytics alert breakdown). */
export const ALERT_STATUS_CHART_COLORS: Record<string, string> = {
  New: "#C0392B",
  Acknowledged: "#D97706",
  Resolved: "#1E7A46",
}

/**
 * Severity pill classes (bordered chip, no hover/dark variants) — the
 * wizard result chip and the model card's band pills render these.
 */
export const severityPillClass: Record<string, string> = {
  Low: "bg-[#E2F0E6] text-[#1E7A46] border-[#1E7A46]/30",
  Moderate: "bg-[#FDF0DC] text-[#A85008] border-[#D97706]/30",
  High: "bg-[#FAE9E7] text-[#C0392B] border-[#C0392B]/30",
  Critical: "bg-[#C0392B] text-white border-[#C0392B]",
}

/** Alert-row tint per severity (Alerts Center list rows). */
export function severityRowClass(severity: string): string {
  switch (severity) {
    case "Critical":
    case "High":
      return "border-[#C0392B]/25 bg-[#FAE9E7]/50 hover:bg-[#FAE9E7]"
    case "Moderate":
      return "border-[#D97706]/25 bg-[#FDF0DC]/50 hover:bg-[#FDF0DC]"
    case "Low":
      return "border-[#1E7A46]/25 bg-[#E2F0E6]/50 hover:bg-[#E2F0E6]"
    default:
      return "border-border bg-card hover:bg-muted/40"
  }
}

/** Audit-log action chips (INSERT/UPDATE/DELETE). */
export const auditActionClass: Record<string, string> = {
  INSERT: "bg-[#E2F0E6] text-[#1E7A46] border-[#1E7A46]/30",
  UPDATE: "bg-[#FDF0DC] text-[#A85008] border-[#D97706]/30",
  DELETE: "bg-[#FAE9E7] text-[#C0392B] border-[#C0392B]/30",
}

/** Doctor verification status chips (pending/approved/rejected). */
export const doctorStatusClass: Record<string, string> = {
  pending: "bg-[#FDF0DC] text-[#A85008] border-[#D97706]/30",
  approved: "bg-[#E2F0E6] text-[#1E7A46] border-[#1E7A46]/30",
  rejected: "bg-[#FAE9E7] text-[#C0392B] border-[#C0392B]/30",
}

/** RiskBadge's class map (hover + dark variants included). */
export const severityBadgeClass: Record<string, string> = {
  Low: "bg-[#E2F0E6] text-[#1E7A46] hover:bg-[#E2F0E6]/80 dark:bg-[#1E7A46]/20 dark:text-[#7BC79B]",
  Moderate: "bg-[#FDF0DC] text-[#A85008] hover:bg-[#FDF0DC]/80 dark:bg-[#D97706]/20 dark:text-[#E8A94E]",
  High: "bg-[#FAE9E7] text-[#C0392B] hover:bg-[#FAE9E7]/80 dark:bg-[#C0392B]/20 dark:text-[#E88A7E]",
  Critical: "bg-[#C0392B] text-white hover:bg-[#C0392B]/90 font-bold",
  Unknown: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
}

export function appointmentStatusClass(status?: string | null): string {
  switch (status) {
    case "Requested":
      return "bg-[#FDF0DC] text-[#A85008] border-[#D97706]/25"
    case "Confirmed":
      return "bg-[#2E7FA8]/10 text-[#1F6E96] border-[#2E7FA8]/25"
    case "Completed":
      return "bg-[#E2F0E6] text-[#1E7A46] border-[#1E7A46]/25"
    case "Cancelled":
      return "bg-[#FAE9E7] text-[#C0392B] border-[#C0392B]/25"
    default:
      return "bg-secondary text-secondary-foreground border-border"
  }
}

/**
 * Doctor availability has ONE source of truth: profiles.availability_status
 * (QA Round 1, items 31/89). The legacy `available` boolean is no longer
 * read anywhere. Labels say only what the data says — an unset status is
 * "Not set", never an invented state.
 */
export interface AvailabilityInfo {
  label: string
  className: string
  /** True only when the doctor's recorded status is 'available'. */
  bookable: boolean
}

export function availabilityInfo(status?: string | null): AvailabilityInfo {
  switch (status) {
    case "available":
      return {
        label: "Available",
        className: "bg-[#E2F0E6] text-[#1E7A46] border-[#1E7A46]/25",
        bookable: true,
      }
    case "busy":
      return {
        label: "Busy",
        className: "bg-[#FDF0DC] text-[#A85008] border-[#D97706]/25",
        bookable: false,
      }
    case "on_leave":
      return {
        label: "On Leave",
        className: "bg-secondary text-secondary-foreground border-border",
        bookable: false,
      }
    default:
      return {
        label: "Not set",
        className: "bg-secondary text-secondary-foreground border-border",
        bookable: false,
      }
  }
}

/**
 * Disease-series chart ramp (QA Round 3, visual V6): built ONLY from
 * locked palette tokens — Primary, Accent, the brand-text steel, the
 * Unknown grey, Ink, and Light. The analytics view previously invented
 * five in-between blues that exist nowhere else in the product.
 */
export const DISEASE_CHART_COLORS: string[] = [
  "#0D2B3E", // Primary
  "#2E7FA8", // Accent
  "#1F6E96", // brand text steel
  "#5A6B73", // Unknown grey
  "#06141B", // Ink
  "#9FB6BF", // Light-derived steel (chart-only tint of #CCD0CF family)
  "#2E7FA8",
  "#0D2B3E",
]

/** Banner recipes (QA Round 3, visual V13): one per intent, product-wide. */
export const BANNER_CLASSES = {
  success: "border-[#1E7A46]/30 bg-[#E2F0E6] text-[#1E7A46]",
  warning: "border-[#D97706]/30 bg-[#FDF0DC] text-[#A85008]",
  error: "border-[#C0392B]/30 bg-[#FAE9E7] text-[#C0392B]",
  info: "border-[#2E7FA8]/30 bg-[#2E7FA8]/10 text-[#1F6E96]",
} as const

/** Neutral accent bar fill for metric bars (QA Round 3, visual V3). */
export const ACCENT_BAR_CLASS = "bg-[#2E7FA8]"
