import { redirect } from "next/navigation"
import { AdminTabs } from "@/components/shared/AdminTabs"
import { getCurrentProfile, getCurrentUser } from "@/lib/current-profile"

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Shared per-request reads (React cache): the admin page rendered
  // under this layout reuses the same getUser + profile row.
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const profile = await getCurrentProfile()

  const allowedRoles = ['super_admin', 'hospital_admin', 'data_scientist']
  if (!profile || !profile.role || !allowedRoles.includes(profile.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage users, review model performance, monitor drift, and audit system activity.
        </p>
      </div>
      <AdminTabs />
      <div>{children}</div>
    </div>
  )
}
