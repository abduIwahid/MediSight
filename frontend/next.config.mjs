/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build gates are ON: TypeScript and ESLint errors fail the production
  // build. Do not re-add typescript.ignoreBuildErrors or
  // eslint.ignoreDuringBuilds — the codebase is kept at zero errors.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  // Baseline security headers on every response (QA Round 2, security
  // M2). The app previously sent none of these, so the signed-in
  // clinical dashboard could be embedded in any origin's iframe
  // (clickjacking).
  //
  // Deliberate scope: the Content-Security-Policy below carries ONLY
  // the frame-ancestors directive. A full CSP (script-src/style-src/…)
  // is NOT guessed here — Next.js serves inline bootstrap scripts, the
  // app loads Google Fonts, and Supabase/realtime endpoints would all
  // need an allowlist verified against the running app; a wrong guess
  // breaks production silently. frame-ancestors on its own restricts
  // nothing except framing, which is exactly the gap being closed.
  // A full CSP is a separate, verified change.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
