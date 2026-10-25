import type { PatientRow } from "@/lib/types"

/**
 * Maps an age in years to the BRFSS `_AGEG5YR` band (1–13) the diabetes
 * model was trained on: 1 = 18–24, then five-year bands 2 = 25–29 …
 * 12 = 75–79, and 13 = 80 or older. Ages under 25 map to band 1.
 *
 * This is the ONLY age mapping the frontend may use. Two earlier
 * derivations disagreed with the training coding — `ceil(age / 10)` in
 * this file's caller history and `floor(age / 5)` in the retired
 * predict-risk edge function — and silently fed the model wrong bands
 * (e.g. age 65 must be band 10, not 7 or 13).
 */
export function brfssAgeBand(ageYears: number): number {
  if (!Number.isFinite(ageYears) || ageYears < 25) return 1
  if (ageYears >= 80) return 13
  return Math.floor((ageYears - 25) / 5) + 2
}

/**
 * The population defaults used for every feature the patient's record
 * cannot supply. This object is the SINGLE source for both the payload
 * builder below and the "Inputs used" disclosure on the prediction
 * detail page and print report — a feature listed here is exactly a
 * feature that was assumed, never measured, for that score.
 *
 * The four lifestyle factors (HighChol, Smoker, PhysActivity, GenHlth)
 * are collected at intake and persisted in demographics; their defaults
 * apply only to records created before that persistence existed (or
 * where the factor was never recorded).
 */
export const FEATURE_DEFAULTS = {
  HighBP: 0.0,
  HighChol: 0.0,
  CholCheck: 1.0,
  BMI: 25.0,
  Smoker: 0.0,
  Stroke: 0.0,
  HeartDiseaseorAttack: 0.0,
  PhysActivity: 1.0,
  Fruits: 1.0,
  Veggies: 1.0,
  HvyAlcoholConsump: 0.0,
  AnyHealthcare: 1.0,
  NoDocbcCost: 0.0,
  GenHlth: 3.0,
  MentHlth: 0.0,
  PhysHlth: 0.0,
  DiffWalk: 0.0,
  Sex: 0.0,
  Age: 5.0,
  Education: 5.0,
  Income: 6.0,
} as const

export type MLFeatureName = keyof typeof FEATURE_DEFAULTS
export type MLFeaturePayload = Record<MLFeatureName, number>

/** Every feature name, in model order. */
export const FEATURE_NAMES = Object.keys(FEATURE_DEFAULTS) as MLFeatureName[]

/**
 * Splits a scored payload into the features that came from the patient's
 * record and the features that were assumed defaults — the disclosure
 * the detail page and print report render. A stored snapshot
 * (predictions.features) can also be classified this way by passing it
 * with the set of features the record supplied at scoring time; without
 * that set, a snapshot value equal to a default is reported as assumed,
 * which is the conservative reading.
 */
export function classifyPayloadFeatures(
  payload: Partial<Record<string, number>>,
  recordedFeatures?: ReadonlySet<string> | readonly string[]
): { recorded: MLFeatureName[]; assumed: MLFeatureName[] } {
  const recordedSet = recordedFeatures ? new Set(recordedFeatures) : null
  const recorded: MLFeatureName[] = []
  const assumed: MLFeatureName[] = []
  for (const name of FEATURE_NAMES) {
    const value = payload[name]
    const isRecorded = recordedSet
      ? recordedSet.has(name)
      : value !== undefined && value !== FEATURE_DEFAULTS[name]
    if (isRecorded) recorded.push(name)
    else assumed.push(name)
  }
  return { recorded, assumed }
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** A stored 0/1 (or boolean) demographics value, or null when absent. */
function storedBinary(d: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = d[key]
    if (typeof v === "boolean") return v ? 1 : 0
    const n = numOrNull(v)
    if (n !== null) return n === 0 ? 0 : 1
  }
  return null
}

/** The demographics keys the intake form persists its risk factors under. */
export const INTAKE_RISK_FACTOR_KEYS = {
  HighChol: "high_chol",
  Smoker: "smoker",
  PhysActivity: "phys_activity",
  GenHlth: "gen_hlth",
} as const

/**
 * Builds the 21-feature BRFSS payload the ML service expects from a
 * patient record, together with the set of features the record actually
 * supplied. This is the single derivation used both when a real
 * prediction is run (RunPredictionButton) and when the what-if simulator
 * explores changes — so a simulation always starts from exactly the
 * inputs the stored prediction was generated with.
 *
 * Vitals are matched by their LATEST recorded_at, never by array order:
 * the embeds that feed this builder carry no ORDER BY, so the first
 * matching row used to be the oldest measurement on file.
 *
 * Fields the record cannot supply fall back to FEATURE_DEFAULTS above.
 */
export function buildMLPayload(patient: PatientRow): {
  payload: MLFeaturePayload
  recordedFeatures: MLFeatureName[]
} {
  const d = (patient.demographics || {}) as Record<string, unknown>
  const vitals = patient.vitals || []
  const diagnoses = patient.diagnoses || []
  const recorded = new Set<MLFeatureName>()

  const latestVital = (needle: string) =>
    vitals
      .filter((v) => v.type?.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.recorded_at || 0).getTime() - new Date(a.recorded_at || 0).getTime())[0]

  const bmiVital = latestVital("bmi")
  const bpVital = latestVital("systolic") || latestVital("blood pressure")

  const bmiNum = bmiVital ? parseFloat(String(bmiVital.value)) : NaN
  const hasBmi = Number.isFinite(bmiNum)
  if (hasBmi) recorded.add("BMI")
  const bpNum = bpVital ? parseInt(String(bpVital.value)) : NaN
  const hasBp = Number.isFinite(bpNum)
  if (hasBp) recorded.add("HighBP")

  const dobRaw = (d.birth_date as string) || (d.dob as string)
  const storedAge = numOrNull(d.age)
  const ageNum = storedAge ?? (
    dobRaw
      ? Math.floor((Date.now() - new Date(dobRaw).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null
  )
  if (ageNum !== null) recorded.add("Age")

  const gender = typeof d.gender === "string" ? d.gender.toLowerCase() : ""
  const hasGender = gender === "male" || gender === "female"
  if (hasGender) recorded.add("Sex")

  // Diagnoses are real record data even when the answer is "no history":
  // the diagnoses embed is part of the fetched record, so both features
  // count as recorded.
  recorded.add("Stroke")
  recorded.add("HeartDiseaseorAttack")
  const hasHeart = diagnoses.some((dx) => dx.condition?.toLowerCase().includes("heart"))
  const hasStroke = diagnoses.some((dx) => dx.condition?.toLowerCase().includes("stroke"))

  // The four intake risk factors, persisted in demographics by the New
  // Patient flow (INTAKE_RISK_FACTOR_KEYS). Absent → documented default.
  const highChol = storedBinary(d, INTAKE_RISK_FACTOR_KEYS.HighChol, "highChol", "HighChol")
  if (highChol !== null) recorded.add("HighChol")
  const smoker = storedBinary(d, INTAKE_RISK_FACTOR_KEYS.Smoker, "Smoker")
  if (smoker !== null) recorded.add("Smoker")
  const physActivity = storedBinary(d, INTAKE_RISK_FACTOR_KEYS.PhysActivity, "physActivity", "PhysActivity")
  if (physActivity !== null) recorded.add("PhysActivity")
  const genHlthRaw = numOrNull(d[INTAKE_RISK_FACTOR_KEYS.GenHlth]) ?? numOrNull(d.genHlth) ?? numOrNull(d.GenHlth)
  const genHlth = genHlthRaw !== null && genHlthRaw >= 1 && genHlthRaw <= 5 ? genHlthRaw : null
  if (genHlth !== null) recorded.add("GenHlth")

  const payload: MLFeaturePayload = {
    HighBP: hasBp ? (bpNum >= 130 ? 1.0 : 0.0) : FEATURE_DEFAULTS.HighBP,
    HighChol: highChol ?? FEATURE_DEFAULTS.HighChol,
    CholCheck: FEATURE_DEFAULTS.CholCheck,
    BMI: hasBmi ? bmiNum : FEATURE_DEFAULTS.BMI,
    Smoker: smoker ?? FEATURE_DEFAULTS.Smoker,
    Stroke: hasStroke ? 1.0 : 0.0,
    HeartDiseaseorAttack: hasHeart ? 1.0 : 0.0,
    PhysActivity: physActivity ?? FEATURE_DEFAULTS.PhysActivity,
    Fruits: FEATURE_DEFAULTS.Fruits,
    Veggies: FEATURE_DEFAULTS.Veggies,
    HvyAlcoholConsump: FEATURE_DEFAULTS.HvyAlcoholConsump,
    AnyHealthcare: FEATURE_DEFAULTS.AnyHealthcare,
    NoDocbcCost: FEATURE_DEFAULTS.NoDocbcCost,
    GenHlth: genHlth ?? FEATURE_DEFAULTS.GenHlth,
    MentHlth: FEATURE_DEFAULTS.MentHlth,
    PhysHlth: FEATURE_DEFAULTS.PhysHlth,
    DiffWalk: FEATURE_DEFAULTS.DiffWalk,
    Sex: hasGender ? (gender === "male" ? 1.0 : 0.0) : FEATURE_DEFAULTS.Sex,
    Age: ageNum !== null ? brfssAgeBand(ageNum) : FEATURE_DEFAULTS.Age,
    Education: FEATURE_DEFAULTS.Education,
    Income: FEATURE_DEFAULTS.Income,
  }

  return { payload, recordedFeatures: [...recorded] }
}
