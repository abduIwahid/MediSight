import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ALL_SYMPTOMS, DISEASE_PROFILES } from "@/lib/symptoms"

const STAFF_ROLES = ["doctor", "nurse", "hospital_admin", "super_admin", "data_scientist"]

/**
 * Lightweight rule-based symptom screening engine.
 *
 * NOTE: This is a heuristic symptom-checker used for the "Disease Prediction Wizard"
 * intake flow. It is intentionally separate from the trained LightGBM diabetes model
 * (see /api/predict) which operates on structured clinical features, not free symptoms.
 * This engine exists to give patients a fast triage signal + doctor recommendation.
 * It must never be presented as a diagnosis.
 */

export async function GET() {
  return NextResponse.json({ symptoms: ALL_SYMPTOMS })
}

export async function POST(request: Request) {
  // Staff-only gate, mirroring /api/predict: the symptom wizard's only
  // UI consumer is the staff prediction page. A bare session check let
  // any signed-in PATIENT call this engine directly and receive disease
  // names and risk labels — exactly the class of output the patient
  // portal is designed never to give them (QA Round 2, security M3).
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Clinical staff access required." }, { status: 403 })
  }

  if (profile.role === "doctor") {
    const { data: doctor } = await supabase
      .from("doctors")
      .select("status")
      .eq("user_id", user.id)
      .single()
    if (doctor?.status !== "approved") {
      return NextResponse.json({ error: "Doctor account is not approved yet." }, { status: 403 })
    }
  }

  try {
    const { symptoms } = await request.json()

    if (!Array.isArray(symptoms) || symptoms.length === 0) {
      return NextResponse.json({ error: "Please select at least one symptom." }, { status: 400 })
    }

    const selected = new Set(symptoms as string[])

    const scored = DISEASE_PROFILES.map((profile) => {
      const maxPossible = Object.values(profile.symptoms).reduce((a, b) => a + b, 0)
      let matched = 0
      let matchedCount = 0
      for (const s of selected) {
        if (profile.symptoms[s]) {
          matched += profile.symptoms[s]
          matchedCount += 1
        }
      }
      const coverage = matchedCount / Object.keys(profile.symptoms).length
      const weightScore = maxPossible > 0 ? matched / maxPossible : 0
      const confidence = Math.min(0.97, weightScore * 0.7 + coverage * 0.3)
      return { profile, confidence, matchedCount }
    })
      .filter((s) => s.matchedCount > 0)
      .sort((a, b) => b.confidence - a.confidence)

    if (scored.length === 0) {
      return NextResponse.json({
        disease: "Non-specific symptoms",
        specialty: "General Practitioner",
        // Integer percent, like every other response from this route —
        // this fallback used to return the fraction 0.35, which the
        // wizard rendered as a "0%" / "1%" match (QA Round 2, cluster 8).
        confidence: 35,
        risk: "Low",
        recommendations: [
          "Monitor your symptoms over the next 24-48 hours",
          "Stay hydrated and rest",
          "Consult a general practitioner if symptoms persist or worsen",
        ],
      })
    }

    const top = scored[0]
    const confidencePct = Math.round(top.confidence * 100)
    const risk =
      confidencePct >= 80 ? "Critical" : confidencePct >= 60 ? "High" : confidencePct >= 35 ? "Moderate" : "Low"

    return NextResponse.json({
      disease: top.profile.disease,
      specialty: top.profile.specialty,
      confidence: confidencePct,
      risk,
      recommendations: top.profile.recommendations,
      alternatives: scored.slice(1, 3).map((s) => ({
        disease: s.profile.disease,
        confidence: Math.round(s.confidence * 100),
      })),
    })
  } catch (error: unknown) {
    // Raw error text can carry internals — log it server-side and give
    // the caller a generic message, like the rest of the ML API family.
    console.error("[api/predict-symptoms] Unexpected error:", error)
    return NextResponse.json(
      { error: "The symptom check could not be completed. Please try again." },
      { status: 500 }
    )
  }
}
