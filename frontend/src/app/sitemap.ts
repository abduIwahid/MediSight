import type { MetadataRoute } from "next"

// The sitemap lists only the genuinely public routes. The canonical base
// URL comes from NEXT_PUBLIC_SITE_URL (the same variable auth redirects
// use); the localhost fallback only applies to local builds.
const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")

export default function sitemap(): MetadataRoute.Sitemap {
  // Fixed launch date — a per-request `new Date()` would claim every
  // page changed on every crawl. The bare "/" is NOT listed: it
  // 307-redirects to /welcome, and sitemaps list canonical 200s only.
  const lastModified = new Date("2026-10-25")
  return [
    { url: `${base}/welcome`, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/model-card`, lastModified, changeFrequency: "monthly", priority: 0.9 },
  ]
}
