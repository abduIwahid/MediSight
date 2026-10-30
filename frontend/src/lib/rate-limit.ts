/**
 * Best-effort, in-memory rate limiting for API routes.
 *
 * Serverless instances are short-lived and do not share memory, so this
 * is a per-instance brake, not a distributed quota: it stops a single
 * client from hammering one warm instance (the realistic abuse shape
 * for this app — a script looping predictions or chat messages), and it
 * degrades to "allow" whenever state is cold. It deliberately does NOT
 * pretend to be a hard global limit; that would need shared storage
 * (e.g. Upstash) this project does not run.
 *
 * Limits are set far above anything a human using the UI can reach —
 * the prediction UI debounces to at most ~2 calls/second for a few
 * seconds at a time, and chat is one message per send. A 429 from this
 * limiter means scripted traffic, not a busy clinician.
 */

interface WindowState {
  count: number
  resetAt: number
}

const windows = new Map<string, WindowState>()

// Opportunistic cleanup so a long-lived instance does not accumulate
// one entry per key forever. Runs at most once a minute.
let lastSweep = 0
function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, state] of windows) {
    if (state.resetAt <= now) windows.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the window resets; only meaningful when blocked. */
  retryAfterSeconds: number
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  sweep(now)
  const state = windows.get(key)
  if (!state || state.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }
  if (state.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
    }
  }
  state.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

/** The honest 429 body every limited route returns. */
export function rateLimitBody() {
  return {
    error:
      "Too many requests in a short time. Please wait a moment and try again.",
  }
}

/** Client IP from the platform headers, for unauthenticated routes. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("x-real-ip") || "unknown"
}
