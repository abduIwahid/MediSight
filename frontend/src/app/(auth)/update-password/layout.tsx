import type { Metadata } from "next"

// Segment metadata for the update-password page (a client component).
// Without its own layout, this route fell back to the (auth) group
// default "Account — WhyRisk", which the root template then suffixed
// again — rendering "Account — WhyRisk — WhyRisk" (QA Round 2,
// cluster 25). Mirrors the login/signup segment layouts.
export const metadata: Metadata = {
  title: "Update password",
  description: "Set a new password for your WhyRisk account.",
  alternates: { canonical: "/update-password" },
  openGraph: { url: "/update-password", title: "Update password — WhyRisk" },
}

export default function UpdatePasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
