import { ImageResponse } from "next/og"

export const runtime = "edge"
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

// Apple touch icon: the Pulse tile (same geometry as src/app/icon.svg).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D2B3E",
        }}
      >
        <svg width="150" height="150" viewBox="0 0 120 120">
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
      </div>
    ),
    { ...size }
  )
}
