import type { MetadataRoute } from "next"

// The sitemap lists only the genuinely public routes. The canonical base
// URL comes from NEXT_PUBLIC_SITE_URL (the same variable auth redirects
// use); the localhost fallback only applies to local builds.
const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return [
    { url: `${base}/`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/welcome`, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/model-card`, lastModified, changeFrequency: "monthly", priority: 0.9 },
  ]
}
