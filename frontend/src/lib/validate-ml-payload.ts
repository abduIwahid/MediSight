import { FEATURE_NAMES } from "@/lib/prediction-features"

/**
 * Server-side validation for ML payloads (QA Round 3, api-security M2):
 * /api/predict and /api/explain used to forward the request body to the
 * ML service verbatim, so any staff session could send megabytes of
 * junk or out-of-domain values straight past the API. The payload must
 * be exactly the 21 model features, each a finite number inside its
 * BRFSS domain.
 */
const RANGES: Record<string, [number, number]> = {
  BMI: [10, 80],
  GenHlth: [1, 5],
  MentHlth: [0, 30],
  PhysHlth: [0, 30],
  Age: [1, 13],
  Education: [1, 6],
  Income: [1, 8],
  // every other feature is a 0/1 indicator
}

export function validateMLPayload(
  payload: unknown
): { ok: true; value: Record<string, number> } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "A feature object is required." }
  }
  const obj = payload as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (!(FEATURE_NAMES as string[]).includes(key)) {
      return { ok: false, error: `Unknown feature: ${key}.` }
    }
  }
  const value: Record<string, number> = {}
  for (const name of FEATURE_NAMES) {
    const raw = obj[name]
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return { ok: false, error: `Feature ${name} must be a number.` }
    }
    const [min, max] = RANGES[name] ?? [0, 1]
    if (raw < min || raw > max) {
      return { ok: false, error: `Feature ${name} is outside its valid range.` }
    }
    value[name] = raw
  }
  return { ok: true, value }
}
