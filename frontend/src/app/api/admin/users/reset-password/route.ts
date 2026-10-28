import { NextResponse } from "next/server"
import { requireSuperAdmin, createAdminClient, logAdminAction } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  const auth = await requireSuperAdmin()
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  const { userId, newPassword } = await request.json().catch(() => ({}))

  // Type/shape validation first (QA Round 3, api-security L5): a
  // numeric password used to pass the length check via String()
  // coercion and then fail opaquely inside the Admin API.
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: "Please choose the user whose password you want to reset." }, { status: 400 })
  }
  if (typeof newPassword !== "string" || newPassword.length === 0) {
    return NextResponse.json({ error: "Please enter the new password." }, { status: 400 })
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "The new password must be at least 8 characters." }, { status: 400 })
  }
  if (newPassword.length > 72) {
    return NextResponse.json({ error: "The new password must be 72 characters or fewer." }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) {
    console.error("[api/admin/users/reset-password] Password reset failed:", error.message)
    return NextResponse.json(
      { error: "The password could not be reset. Please try again." },
      { status: 400 }
    )
  }

  // Attributed audit row (QA Round 2, SA-3): a password reset is one of
  // the most sensitive admin actions, and auth.users writes fire no DB
  // trigger — without this insert the trail would never name the admin
  // who performed it. (The new password itself is never logged.)
  await logAdminAction({
    actorId: auth.userId,
    action: "UPDATE",
    tableName: "profiles",
    rowId: userId,
    newValues: { event: "password_reset_by_admin" },
  })

  return NextResponse.json({ success: true })
}
