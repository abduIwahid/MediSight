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
};

export default nextConfig;
