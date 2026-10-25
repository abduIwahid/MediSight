import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your WhyRisk account — patient and staff portals.",
  alternates: { canonical: "/login" },
  openGraph: { url: "/login", title: "Sign in — WhyRisk" },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
