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
 * Builds the 21-feature BRFSS payload the ML service expects from a
 * patient record. This is the single derivation used both when a real
 * prediction is run (RunPredictionButton) and when the what-if simulator
 * explores changes — so a simulation always starts from exactly the
 * inputs the stored prediction was generated with.
 *
 * Fields the record cannot supply fall back to the same documented
 * defaults the run-prediction flow has always used.
 */
export function buildMLPayload(patient: PatientRow) {
  const d = patient.demographics || {}
  const vitals = patient.vitals || []
  const diagnoses = patient.diagnoses || []

  const bmiVital = vitals.find((v) => v.type?.toLowerCase().includes("bmi"))
  const bpVital = vitals.find((v) => v.type?.toLowerCase().includes("systolic") || v.type?.toLowerCase().includes("blood pressure"))

  const bmiNum = bmiVital ? parseFloat(String(bmiVital.value)) || 25 : 25
  const bpNum = bpVital ? parseInt(String(bpVital.value)) || 120 : 120
  const dobRaw = d.birth_date || d.dob
  const ageNum = d.age || (
    dobRaw
      ? Math.floor((Date.now() - new Date(dobRaw).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : 40
  )
  const ageGroup = brfssAgeBand(ageNum)
  const hasHeart = diagnoses.some((dx) => dx.condition?.toLowerCase().includes("heart"))
  const hasStroke = diagnoses.some((dx) => dx.condition?.toLowerCase().includes("stroke"))

  return {
    HighBP: bpNum >= 130 ? 1.0 : 0.0,
    HighChol: 0.0,
    CholCheck: 1.0,
    BMI: bmiNum,
    Smoker: 0.0,
    Stroke: hasStroke ? 1.0 : 0.0,
    HeartDiseaseorAttack: hasHeart ? 1.0 : 0.0,
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
    Sex: (d.gender || "").toLowerCase() === "male" ? 1.0 : 0.0,
    Age: ageGroup,
    Education: 5.0,
    Income: 6.0,
  }
}

export type MLFeaturePayload = ReturnType<typeof buildMLPayload>
