/**
 * Human labels for the 21 BRFSS model features and their coded values.
 *
 * SHAP payloads store raw BRFSS codes ("Age (10)", "GenHlth (3)") — codes
 * a clinician should never have to decode. Every surface that renders a
 * factor (prediction detail, print report, chat, what-if) formats through
 * here so the same feature reads the same way everywhere.
 *
 * Codings verified against the ML service (ml-service/app/main.py field
 * descriptions and ml-service/model_training/seed_db.py):
 * - Sex: 1 = Male, 0 = Female.
 * - Age: BRFSS _AGEG5YR bands 1–13 (1 = 18–24, then five-year bands,
 *   13 = 80 or older) — the same mapping brfssAgeBand() writes.
 * - GenHlth: 1 = Excellent … 5 = Poor.
 * - Income / Education: the standard BRFSS 1–8 / 1–6 scales.
 */

const BINARY_FEATURES = new Set([
  "HighBP",
  "HighChol",
  "CholCheck",
  "Smoker",
  "Stroke",
  "HeartDiseaseorAttack",
  "PhysActivity",
  "Fruits",
  "Veggies",
  "HvyAlcoholConsump",
  "AnyHealthcare",
  "NoDocbcCost",
  "DiffWalk",
])

export const FEATURE_LABELS: Record<string, string> = {
  HighBP: "High blood pressure",
  HighChol: "High cholesterol",
  CholCheck: "Cholesterol checked in last 5 years",
  BMI: "BMI",
  Smoker: "Smoker (100+ cigarettes in lifetime)",
  Stroke: "Prior stroke",
  HeartDiseaseorAttack: "Heart disease or heart attack",
  PhysActivity: "Physically active in past 30 days",
  Fruits: "Eats fruit at least once a day",
  Veggies: "Eats vegetables at least once a day",
  HvyAlcoholConsump: "Heavy alcohol use",
  AnyHealthcare: "Has health coverage",
  NoDocbcCost: "Skipped a doctor visit due to cost",
  GenHlth: "General health",
  MentHlth: "Poor mental-health days in past 30",
  PhysHlth: "Poor physical-health days in past 30",
  DiffWalk: "Difficulty walking or climbing stairs",
  Sex: "Sex",
  Age: "Age group",
  Education: "Education",
  Income: "Income",
}

const AGE_BANDS: Record<number, string> = {
  1: "18–24",
  2: "25–29",
  3: "30–34",
  4: "35–39",
  5: "40–44",
  6: "45–49",
  7: "50–54",
  8: "55–59",
  9: "60–64",
  10: "65–69",
  11: "70–74",
  12: "75–79",
  13: "80 or older",
}

const GEN_HLTH_LABELS: Record<number, string> = {
  1: "Excellent",
  2: "Very good",
  3: "Good",
  4: "Fair",
  5: "Poor",
}

const INCOME_BANDS: Record<number, string> = {
  1: "Under $10,000",
  2: "$10,000–$15,000",
  3: "$15,000–$20,000",
  4: "$20,000–$25,000",
  5: "$25,000–$35,000",
  6: "$35,000–$50,000",
  7: "$50,000–$75,000",
  8: "$75,000 or more",
}

const EDUCATION_LABELS: Record<number, string> = {
  1: "Never attended school or only kindergarten",
  2: "Grades 1–8",
  3: "Grades 9–11",
  4: "High school graduate",
  5: "Some college or technical school",
  6: "College graduate",
}

/** The feature's human name (falls back to the raw code for unknown keys). */
export function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature
}

/** A coded feature value rendered the way a person would say it. */
export function formatFeatureValue(feature: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Not recorded"
  const num = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(num)) return String(value)

  if (feature === "Age") return AGE_BANDS[num] ?? `Band ${num}`
  if (feature === "GenHlth") return GEN_HLTH_LABELS[num] ?? String(num)
  if (feature === "Income") return INCOME_BANDS[num] ?? String(num)
  if (feature === "Education") return EDUCATION_LABELS[num] ?? String(num)
  if (feature === "Sex") return num === 1 ? "Male" : num === 0 ? "Female" : String(num)
  if (feature === "MentHlth" || feature === "PhysHlth") return `${num} days`
  if (feature === "BMI") return String(Number(num.toFixed(1)))
  if (BINARY_FEATURES.has(feature)) return num === 1 ? "Yes" : num === 0 ? "No" : String(num)
  return String(num)
}

/** "Age group (65–69)" — the full factor label SHAP surfaces display. */
export function formatShapFactorLabel(feature: string, value: string | number | null | undefined): string {
  return `${featureLabel(feature)} (${formatFeatureValue(feature, value)})`
}
