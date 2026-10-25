import { NextResponse } from "next/server"
import { requireSuperAdmin, createAdminClient } from "@/lib/supabase/admin"

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin()
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  const body = await request.json().catch(() => ({}))
  const { email, full_name, phone, contact_number, hospital_id, department, role } = body

  const admin = createAdminClient()

  // Email lives on auth.users, not public.profiles — update it there first
  // via the Admin API so login credentials stay in sync with the profile.
  if (email) {
    const { error: authError } = await admin.auth.admin.updateUserById(params.id, { email })
    if (authError) {
      return NextResponse.json({ error: `Failed to update email: ${authError.message}` }, { status: 400 })
    }
  }

  // Explicit column allowlist — this update runs with the service-role
  // client (RLS bypassed), so the request body must never be spread into
  // it. Only the fields named here can ever be written; anything else in
  // the body is ignored. (Profiles has no `phone`/`specialty` column —
  // the phone number lives in `contact_number`; both body spellings are
  // accepted and mapped to it.)
  const profileUpdates: Record<string, unknown> = {}
  if (email !== undefined) profileUpdates.email = email
  if (full_name !== undefined) profileUpdates.full_name = full_name
  if (contact_number !== undefined) profileUpdates.contact_number = contact_number
  else if (phone !== undefined) profileUpdates.contact_number = phone
  if (hospital_id !== undefined) profileUpdates.hospital_id = hospital_id
  if (department !== undefined) profileUpdates.department = department
  // Role changes go through the same admin client so the
  // prevent_self_role_escalation trigger (which only blocks the *acting*
  // user's own row) doesn't interfere with a genuine admin action.
  if (role !== undefined) profileUpdates.role = role

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await admin
      .from("profiles")
      .update(profileUpdates)
      .eq("id", params.id)
    if (profileError) {
      return NextResponse.json({ error: `Failed to update profile: ${profileError.message}` }, { status: 400 })
    }
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
  // Deleting the auth.users row cascades to public.profiles (and everything
  // referencing it) via the ON DELETE CASCADE foreign key set up in the
  // original schema — no separate profile delete needed.
  const { error } = await admin.auth.admin.deleteUser(params.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
