import type { Metadata } from "next"

// Segment metadata for the forgot-password page (a client component).
// Without its own layout, this route fell back to the (auth) group
// default "Account — WhyRisk", which the root template then suffixed
// again — rendering "Account — WhyRisk — WhyRisk" (QA Round 2,
// cluster 25). Mirrors the login/signup segment layouts.
export const metadata: Metadata = {
  title: "Forgot password",
  description: "Reset your WhyRisk account password by email.",
  alternates: { canonical: "/forgot-password" },
  openGraph: { url: "/forgot-password", title: "Forgot password — WhyRisk" },
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
