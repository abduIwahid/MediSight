import type { Metadata } from "next"

// The pending-approval holding page is an authenticated state, not
// content (QA Round 3, SEO M2).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function PendingApprovalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
