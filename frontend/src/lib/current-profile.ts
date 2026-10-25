import { cache } from "react"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import type { ProfileRow } from "@/lib/types"

/**
 * The signed-in user's auth record and profile row for THIS request.
 *
 * Both helpers are wrapped in React cache(), so every server component
 * rendered for one request — the admin layout, the page under it, the
 * report page's issuing line — shares a single auth.getUser() call and
 * a single profiles read instead of each re-fetching the same row.
 * (Middleware keeps its own read: it runs in a separate runtime and
 * only fetches when a routing decision needs the role.)
 *
 * Client components are unaffected — they keep their own fetches
 * through the browser Supabase client.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export const getCurrentProfile = cache(async (): Promise<ProfileRow | null> => {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = createClient()
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  return (data as ProfileRow | null) ?? null
})
