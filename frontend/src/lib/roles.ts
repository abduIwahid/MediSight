/**
 * The ONE role glossary for the product (QA Round 1, items 70/83):
 * every surface that names a role — profile, admin views, sidebar chip —
 * reads its label from here so the same role is never called two
 * different things in two places.
 */
export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  hospital_admin: "Hospital Admin",
  doctor: "Doctor",
  nurse: "Nurse",
  data_scientist: "Data Scientist",
  patient: "Patient",
}

export function roleLabel(role?: string | null): string {
  if (!role) return "No role assigned"
  return ROLE_LABELS[role] || role
}

/**
 * Badge classes per role, drawn only from the product palette
 * (brand tints + the RiskBadge semantic tints + neutral secondary) —
 * no per-role rainbow.
 */
export const ROLE_BADGE_CLASSES: Record<string, string> = {
  super_admin: "bg-[#FAE9E7] text-[#C0392B] border-[#C0392B]/25",
  hospital_admin: "bg-[#FDF0DC] text-[#A85008] border-[#D97706]/25",
  doctor: "bg-[#2E7FA8]/10 text-[#1F6E96] border-[#2E7FA8]/25",
  nurse: "bg-[#E2F0E6] text-[#1E7A46] border-[#1E7A46]/25",
  data_scientist: "bg-secondary text-secondary-foreground border-border",
  patient: "bg-secondary text-secondary-foreground border-border",
}
