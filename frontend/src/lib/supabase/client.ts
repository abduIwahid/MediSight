import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// One shared browser client for the whole app (QA Round 3, auth L4):
// pages used to construct a new GoTrue client on every render, which
// produced "Multiple GoTrueClient instances" warnings and could split
// per-instance auth state (locks, PKCE verifier) across instances
// mid-flow. A module-level singleton removes that class entirely.
let browserClient: SupabaseClient | undefined

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return browserClient
}
