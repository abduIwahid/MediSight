import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a WhyRisk account — patient registration, or apply as a doctor for administrator review.",
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
