/**
 * BrandMark — the WhyRisk "Pulse" icon (Icon A), as a reusable component.
 *
 * variant "tile":  the navy app-icon tile — for light surfaces.
 * variant "glyph": the bare pulse line + accent dot — for dark surfaces
 *                  (brand panel, loader, dark headers).
 *
 * Geometry is copied 1:1 from src/app/icon.svg so every surface shows
 * the exact same mark. Use this instead of /logo.png or letter tiles.
 */
export default function BrandMark({
  variant = "tile",
  className = "h-9 w-9",
}: {
  variant?: "tile" | "glyph";
  className?: string;
}) {
  const pulse = (
    <>
      <path
        d="M16 62 H33 L41 45 L51 83 L63 27 L72 62 H82"
        stroke="#F4F6F6"
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="94" cy="62" r="5.5" fill="#2E7FA8" />
    </>
  );

  if (variant === "glyph") {
    return (
      <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
        {pulse}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <rect x="4" y="4" width="112" height="112" rx="27" fill="#0D2B3E" />
      {pulse}
    </svg>
  );
}
