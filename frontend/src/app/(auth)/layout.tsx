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
  // Account pages are not content (QA Round 3, SEO M2): noindex, and
  // no self-canonicals in the segment layouts either.
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // One <main> landmark + skip link for the whole auth segment
  // (QA Round 3, accessibility A8): the pages render their own
  // content roots, none of which was a landmark before.
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <main id="main-content">{children}</main>
    </>
  )
}
