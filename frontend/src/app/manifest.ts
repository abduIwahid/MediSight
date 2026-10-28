import type { MetadataRoute } from "next"

// Web app manifest (QA Round 3, SEO L2): installable identity using
// the Pulse mark (src/app/icon.svg). Raster 192/512 icons are deferred
// until they can be added outside the text-only push route.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WhyRisk",
    short_name: "WhyRisk",
    description:
      "Diabetes risk prediction with explainable machine learning — every score shows its reasons.",
    start_url: "/welcome",
    display: "standalone",
    background_color: "#F4F6F6",
    theme_color: "#0D2B3E",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  }
}
