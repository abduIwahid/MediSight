import type { Metadata } from "next"

// The auth pages are client components, so their metadata lives in
// layout files. This group layout sets the shared defaults; the login
// and signup segment layouts refine title + canonical per page.
export const metadata: Metadata = {
  title: {
    template: "%s — WhyRisk",
    default: "Account — WhyRisk",
  },
  description: "Sign in or create your WhyRisk account.",
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
