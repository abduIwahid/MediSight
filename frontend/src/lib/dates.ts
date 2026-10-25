/**
 * One date convention for the whole product (QA Round 1, item 76):
 * every user-facing date is formatted in the product's locale timezone,
 * Asia/Karachi, no matter where the code runs. Server components render
 * on Vercel (UTC) and client components in the viewer's browser — without
 * an explicit timeZone the SAME prediction showed different dates on the
 * print report (server) and the detail view (client). Daily buckets
 * (analytics trend, MLOps volume) use dayKey() so they also agree.
 */
export const APP_TIME_ZONE = "Asia/Karachi"

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: APP_TIME_ZONE,
  })
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  })
}

/** YYYY-MM-DD calendar day of an instant, in the app timezone. */
export function dayKey(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // en-CA yields YYYY-MM-DD; parts-based assembly avoids locale surprises.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ""
  return `${get("year")}-${get("month")}-${get("day")}`
}
