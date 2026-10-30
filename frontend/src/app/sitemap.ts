import type { MetadataRoute } from "next"

// The sitemap lists only the genuinely public routes. The canonical base
// URL comes from NEXT_PUBLIC_SITE_URL (the same variable auth redirects
// use); the localhost fallback only applies to local builds.
const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://whyrisk.vercel.app").replace(/\/$/, "")

export default function sitemap(): MetadataRoute.Sitemap {
  // Fixed content date — a per-request `new Date()` would claim every
  // page changed on every crawl. The bare "/" is NOT listed: it
  // 308-redirects to /welcome (next.config redirects), and sitemaps
  // list canonical 200s only.
  const lastModified = new Date("2026-10-28")
  return [
    { url: `${base}/welcome`, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/model-card`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/contact-us`, lastModified: new Date("2026-10-30"), changeFrequency: "monthly", priority: 0.6 },
  ]
}
