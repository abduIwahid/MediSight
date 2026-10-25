import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "WhyRisk — Know your risk. See exactly why."
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Social card: the Pulse tile on the brand navy with the welcome headline.
// Colours and pulse geometry are the locked brand tokens (same path as
// src/app/icon.svg and BrandMark).
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0D2B3E",
          color: "#F4F6F6",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 120 120">
          <path
            d="M16 62 H33 L41 45 L51 83 L63 27 L72 62 H82"
            fill="none"
            stroke="#F4F6F6"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="94" cy="62" r="5.5" fill="#2E7FA8" />
        </svg>
        <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.15, marginTop: 44 }}>
          Know your risk. See exactly why.
        </div>
        <div style={{ fontSize: 30, fontWeight: 600, color: "#2E7FA8", marginTop: 24 }}>
          WhyRisk
        </div>
      </div>
    ),
    { ...size }
  )
}
