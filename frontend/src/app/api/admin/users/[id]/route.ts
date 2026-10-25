import { NextResponse } from "next/server"
import { requireSuperAdmin, createAdminClient, logAdminAction } from "@/lib/supabase/admin"

// The user_role enum (initial schema + the 'patient' addition). A role
// outside this list is rejected here with a readable message instead of
// surfacing as a raw database error from the enum cast (QA Round 2,
// security M4).
const VALID_ROLES = ["super_admin", "hospital_admin", "doctor", "nurse", "data_scientist", "patient"]

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  const body = await request.json().catch(() => ({}))
  const { email, full_name, phone, contact_number, hospital_id, department, role } = body

  // --- Role guards (QA Round 2, SA-5) -------------------------------------
  // Demoting the last super admin — or yourself — can lock the whole
  // organisation out of admin access with no in-product recovery.
  if (role !== undefined) {
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
