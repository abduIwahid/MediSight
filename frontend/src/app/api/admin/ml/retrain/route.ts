import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { mlServiceFetch } from "@/lib/ml-service"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Server-side proxy for the ML service's POST /retrain endpoint.
 * The endpoint requires the ML service API key, which must never reach
 * the browser — the MLOps page calls this route instead of the ML
 * service directly.
 *
 * SUPER ADMIN ONLY (QA Round 2, SA-1): retraining replaces the model
 * every hospital predicts with. It used to admit hospital_admin and
 * data_scientist — roles whose authority everywhere else stops at
 * their own facility (or is read-only) — with no confirmation and no
 * audit record. The successful action is now written to audit_logs
 * with the acting admin's id (see below).
 */
export async function POST() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

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

  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Super admin access required." }, { status: 403 })
  }

  let response: Response | null
  try {
    response = await mlServiceFetch("/retrain", { method: "POST" })
  } catch (err) {
    console.error("[api/admin/ml/retrain] ML service unreachable:", err)
    return NextResponse.json(
      { error: "ML service unavailable." },
      { status: 503 }
    )
  }

  if (!response) {
    console.error(
      "[api/admin/ml/retrain] ML service is not configured (ML_SERVICE_URL and ML_SERVICE_API_KEY must be set)."
    )
    return NextResponse.json(
      { error: "ML service unavailable." },
      { status: 503 }
    )
  }

  if (!response.ok) {
    console.error(
      `[api/admin/ml/retrain] ML service responded with ${response.status}.`
    )
    return NextResponse.json(
      { error: "The ML service could not start retraining." },
      { status: 502 }
    )
  }

  const data = await response.json()

  // Audit the action with the acting admin's id. This route writes no
  // audited table itself, so without this insert a production model
  // change would leave no trace in the audit trail (QA Round 2, SA-1).
  // Best-effort: the retrain has already started — a failed audit
  // write is logged server-side, not reported as a failed retrain.
  try {
    const admin = createAdminClient()
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "UPDATE",
      table_name: "model_registry",
      row_id: user.id,
      new_values: {
        event: "model_retrain_triggered",
        ml_status: typeof data?.status === "string" ? data.status : null,
      },
    })
    if (auditError) {
      console.error("[api/admin/ml/retrain] Audit write failed:", auditError.message)
    }
  } catch (auditErr) {
    console.error("[api/admin/ml/retrain] Audit write failed:", auditErr)
  }

  return NextResponse.json(data)
}
