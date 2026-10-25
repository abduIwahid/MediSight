/**
 * The ONE status palette for the product (QA Round 1, item 8):
 * appointment statuses and doctor availability read their colours from
 * here, built on the canonical RiskBadge tints — low #E2F0E6/#1E7A46,
 * moderate #FDF0DC/#A85008, high #FAE9E7/#C0392B, plus the brand tint
 * for informational states. No local colour maps in views.
 */

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
