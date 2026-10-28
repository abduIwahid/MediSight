import type { Metadata } from "next"

// Onboarding is an authenticated flow, not content (QA Round 3,
// SEO M2). The page itself is a client component, so the metadata
// lives in this server layout.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
