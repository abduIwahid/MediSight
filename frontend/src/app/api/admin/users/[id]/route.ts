import { NextResponse } from "next/server"
import { requireSuperAdmin, requireAdmin, createAdminClient, logAdminAction } from "@/lib/supabase/admin"

// The user_role enum (initial schema + the 'patient' addition). A role
// outside this list is rejected here with a readable message instead of
// surfacing as a raw database error from the enum cast (QA Round 2,
// security M4). 'doctor' is deliberately NOT assignable here (QA Round
// 3, onboarding O-7): stamping profiles.role='doctor' creates a
// clinician identity with no doctors row — no specialty, license or
// approval state — and the account sails past every "is this profile a
// doctor" check while the file-based routes 403 it. The doctor role is
// granted only by approving an application in Doctor Verification.
const VALID_ROLES = ["super_admin", "hospital_admin", "nurse", "data_scientist", "patient"]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  // Super admins and hospital admins (QA Round 3, admin A1): this route
  // is now the ONLY write path for role/hospital changes — the user
  // management UI calls it instead of writing profiles directly, so
  // the guards and the audit row below apply to every change. Hospital
  // admins are scope-constrained further down.
  const auth = await requireAdmin()
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  const body = await request.json().catch(() => ({}))
  const { email, full_name, phone, contact_number, hospital_id, department, role } = body

  // --- Field validation (QA Round 3, api-security L4) -------------------
  // Every supplied field is validated BEFORE anything is written: the
  // route runs with the service role, so a malformed email or an
  // invented hospital id would otherwise land straight in the data.
  if (email !== undefined && (typeof email !== "string" || !EMAIL_PATTERN.test(email) || email.length > 254)) {
    return NextResponse.json({ error: "That email address is not valid." }, { status: 400 })
  }
  if (full_name !== undefined && (typeof full_name !== "string" || full_name.trim().length < 2 || full_name.length > 120)) {
    return NextResponse.json({ error: "The name must be between 2 and 120 characters." }, { status: 400 })
  }
  if (department !== undefined && department !== null && (typeof department !== "string" || department.length > 120)) {
    return NextResponse.json({ error: "The department must be 120 characters or fewer." }, { status: 400 })
  }
  if (contact_number !== undefined && contact_number !== null && (typeof contact_number !== "string" || contact_number.length > 30)) {
    return NextResponse.json({ error: "That phone number is too long." }, { status: 400 })
  } else if (phone !== undefined && (typeof phone !== "string" || phone.length > 30)) {
    return NextResponse.json({ error: "That phone number is too long." }, { status: 400 })
  }
  if (hospital_id !== undefined && hospital_id !== null && (typeof hospital_id !== "string" || !UUID_PATTERN.test(hospital_id))) {
    return NextResponse.json({ error: "That hospital reference is not valid." }, { status: 400 })
  }

  // --- Role guards (QA Round 2, SA-5) -------------------------------------
  // Demoting the last super admin — or yourself — can lock the whole
  // organisation out of admin access with no in-product recovery.
  if (role !== undefined) {
    if (role === "doctor") {
      return NextResponse.json(
        { error: "The doctor role is granted by approving a doctor application in Doctor Verification — it can't be assigned here." },
        { status: 400 }
      )
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "That role is not valid." }, { status: 400 })
    }
    if (params.id === auth.userId && role !== "super_admin") {
      return NextResponse.json(
        { error: "You cannot change your own role. Ask another super admin to make this change." },
        { status: 400 }
      )
    }
  }

  const admin = createAdminClient()

  // Hospital-admin scope (QA Round 3, admin A1): the service-role
  // client bypasses RLS, so the scope a hospital admin's RLS policies
  // used to enforce is applied here instead — they may only modify
  // users currently in their own hospital, never a super_admin's row,
  // never grant super_admin, and only assign their own hospital.
  if (auth.role === "hospital_admin") {
    if (role === "super_admin") {
      return NextResponse.json(
        { error: "Only a super admin can grant the super admin role." },
        { status: 403 }
      )
    }
    if (hospital_id !== undefined && hospital_id !== null && hospital_id !== auth.hospitalId) {
      return NextResponse.json(
        { error: "You can only assign users to your own hospital." },
        { status: 403 }
      )
    }
    const { data: target } = await admin
      .from("profiles")
      .select("role, hospital_id")
      .eq("id", params.id)
      .single()
    if (!target || target.role === "super_admin" || target.hospital_id !== auth.hospitalId) {
      return NextResponse.json(
        { error: "That user is outside your hospital's scope." },
        { status: 403 }
      )
    }
  }

  if (role !== undefined && role !== "super_admin") {
    const { data: target } = await admin
      .from("profiles")
      .select("role")
      .eq("id", params.id)
      .single()
    if (target?.role === "super_admin") {
      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin")
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "This is the last super admin account. Promote another user to super admin before changing this role." },
          { status: 400 }
        )
      }
    }
  }

  // Explicit column allowlist — this update runs with the service-role
  // client (RLS bypassed), so the request body must never be spread into
  // it. Only the fields named here can ever be written; anything else in
  // the body is ignored. The phone number lives in `contact_number`
  // (profiles.phone is retired — see QA Round 2, cluster 21); both body
  // spellings are accepted and mapped to it.
  const profileUpdates: Record<string, unknown> = {}
  if (email !== undefined) profileUpdates.email = email
  if (full_name !== undefined) profileUpdates.full_name = full_name
  if (contact_number !== undefined) profileUpdates.contact_number = contact_number
  else if (phone !== undefined) profileUpdates.contact_number = phone
  if (hospital_id !== undefined) profileUpdates.hospital_id = hospital_id
  if (department !== undefined) profileUpdates.department = department
  // Role changes go through the same admin client. The
  // prevent_self_role_escalation trigger permits the service role
  // explicitly since migration 20261025230000, so a genuine admin
  // action is not blocked by a guard designed for self-service edits.
  if (role !== undefined) profileUpdates.role = role

  // A named hospital must actually exist (QA Round 3, api-security L4).
  if (hospital_id) {
    const { data: hospital } = await admin
      .from("hospitals")
      .select("id")
      .eq("id", hospital_id)
      .single()
    if (!hospital) {
      return NextResponse.json({ error: "That hospital could not be found." }, { status: 400 })
    }
  }

  // Profile first, auth email second: if the profile write fails,
  // nothing has changed anywhere. (The reverse order could move the
  // login email while the profile kept the old one — QA Round 2,
  // data-integrity M5.) The update is verified with .select(): a
  // zero-row match must not report success.
  if (Object.keys(profileUpdates).length > 0) {
    const { data: updated, error: profileError } = await admin
      .from("profiles")
      .update(profileUpdates)
      .eq("id", params.id)
      .select("id")
    if (profileError) {
      console.error("[api/admin/users] Profile update failed:", profileError.message)
      return NextResponse.json(
        { error: "The profile could not be updated. Please try again." },
        { status: 400 }
      )
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "That user could not be found, so nothing was changed." },
        { status: 404 }
      )
    }
  }

  // Email lives on auth.users, not public.profiles — update it via the
  // Admin API so login credentials stay in sync with the profile copy
  // written above.
  if (email) {
    const { error: authError } = await admin.auth.admin.updateUserById(params.id, { email })
    if (authError) {
      console.error("[api/admin/users] Email update failed:", authError.message)
      return NextResponse.json(
        { error: "The profile was updated, but the login email could not be changed. Please try the email change again." },
        { status: 400 }
      )
    }
  }

  if (Object.keys(profileUpdates).length > 0 || email) {
    await logAdminAction({
      actorId: auth.userId,
      action: "UPDATE",
      tableName: "profiles",
      rowId: params.id,
      newValues: { ...profileUpdates, auth_email_updated: Boolean(email) },
    })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  if (params.id === auth.userId) {
    return NextResponse.json({ error: "You cannot delete your own admin account." }, { status: 400 })
  }

  const admin = createAdminClient()

  // Never delete the last super admin (QA Round 2, SA-5).
  const { data: target } = await admin
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", params.id)
    .single()
  if (target?.role === "super_admin") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin")
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "This is the last super admin account. Promote another user to super admin before deleting it." },
        { status: 400 }
      )
    }
  }

  // Deleting the auth.users row cascades to public.profiles (and everything
  // referencing it) via the ON DELETE CASCADE foreign key set up in the
  // original schema — no separate profile delete needed.
  const { error } = await admin.auth.admin.deleteUser(params.id)
  if (error) {
    console.error("[api/admin/users] Account deletion failed:", error.message)
    return NextResponse.json(
      { error: "The account could not be deleted. Please try again." },
      { status: 400 }
    )
  }

  // Attributed audit row (QA Round 2, SA-3): auth.users changes fire no
  // DB trigger, and the cascaded profile delete would be recorded with
  // a NULL actor ("System") — this row names the admin who did it.
  await logAdminAction({
    actorId: auth.userId,
    action: "DELETE",
    tableName: "profiles",
    rowId: params.id,
    oldValues: target
      ? { role: target.role, full_name: target.full_name, email: target.email }
      : null,
    newValues: { event: "account_deleted_via_admin_api" },
  })

  return NextResponse.json({ success: true })
}
