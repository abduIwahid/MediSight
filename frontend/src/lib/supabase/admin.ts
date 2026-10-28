import { createServerClient } from "@supabase/ssr"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

/**
 * Verifies the currently logged-in user (from cookies) is a super_admin.
 * Returns { authorized: true, userId } or { authorized: false, status, message }.
 * Always call this FIRST in any /api/admin/* route before touching the
 * service-role client below.
 */
export async function requireSuperAdmin() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { authorized: false as const, status: 401, message: "Not signed in." }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin") {
    return { authorized: false as const, status: 403, message: "Admin access required." }
  }

  return { authorized: true as const, userId: user.id }
}

/**
 * Verifies the caller is a super_admin OR a hospital_admin and returns
 * their scope (QA Round 3, admin A1). Routes that accept hospital
 * admins MUST apply the scope constraints themselves (the service-role
 * client bypasses RLS): a hospital admin may only modify users in
 * their own hospital, may never touch a super_admin's row, and may
 * never grant super_admin.
 */
export async function requireAdmin() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { authorized: false as const, status: 401, message: "Not signed in." }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, hospital_id")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin" && profile?.role !== "hospital_admin") {
    return { authorized: false as const, status: 403, message: "Admin access required." }
  }

  return {
    authorized: true as const,
    userId: user.id,
    role: profile.role as string,
    hospitalId: (profile.hospital_id as string | null) ?? null,
  }
}

/**
 * Records an admin-API action in the audit trail, attributed to the
 * acting admin. The DB audit triggers (log_phi_access) capture
 * auth.uid(), which is NULL under the service-role client — so actions
 * performed through these routes (password resets, email changes,
 * deletions, retrains) would otherwise be attributed to "System" or
 * leave no trace at all (QA Round 2, SA-3). Best-effort by design: the
 * action itself has already succeeded when this runs, so a failed
 * audit write is logged server-side, never surfaced as a failed action.
 */
export async function logAdminAction(entry: {
  actorId: string
  action: "INSERT" | "UPDATE" | "DELETE"
  tableName: string
  rowId: string
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
}) {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("audit_logs").insert({
      actor_id: entry.actorId,
      action: entry.action,
      table_name: entry.tableName,
      row_id: entry.rowId,
      old_values: entry.oldValues ?? null,
      new_values: entry.newValues ?? null,
    })
    if (error) {
      console.error("[admin] Audit write failed:", error.message)
    }
  } catch (err) {
    console.error("[admin] Audit write failed:", err)
  }
}

/**
 * A privileged Supabase client authenticated with the service_role key.
 * NEVER expose this client or the key to the browser — it bypasses RLS
 * entirely and can manage auth.users directly. Only ever import/use this
 * inside API routes, after requireSuperAdmin() has confirmed the caller
 * is an authorized admin.
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server.")
  }
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
