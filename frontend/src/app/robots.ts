import type { MetadataRoute } from "next"

// Served as /robots.txt. Public pages are crawlable; the authenticated
// application areas are not (they redirect to /login for signed-out
// visitors anyway, so crawling them wastes budget and indexes nothing).
// The sitemap URL uses the canonical base from NEXT_PUBLIC_SITE_URL,
// the same variable auth redirects use.
const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/dashboard",
          "/patients",
          "/patient/",
          "/settings",
          "/onboarding",
          "/pending-approval",
          "/login",
          "/signup",
          "/auth/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
