import type { Metadata } from "next"

// The model-card page is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: "Model card",
  description:
    "What WhyRisk's diabetes model is, the data it was trained and measured on, its live service status, and what it does not do.",
  alternates: { canonical: "/model-card" },
  openGraph: {
    url: "/model-card",
    title: "Model card — WhyRisk",
    description:
      "The diabetes model's dataset, measured performance, live service status, and limitations, stated in full.",
  },
}

export default function ModelCardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
