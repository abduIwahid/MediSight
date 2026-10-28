"use client"

import { useEffect } from "react"

// Last-resort boundary (QA Round 3, states F-08): renders when the
// ROOT layout itself fails, so it must carry its own <html>/<body>
// and cannot rely on the app's CSS or components being available.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Global application error:", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#F4F6F6",
          color: "#06141B",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>WhyRisk ran into a problem</h1>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#41525B" }}>
            The application failed to load. Please try again — if it keeps happening, come back in a few
            minutes.
          </p>
          {error.digest && (
            <p style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "#41525B" }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              marginTop: "1rem",
              minHeight: "2.75rem",
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#0D2B3E",
              color: "#FFFFFF",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
