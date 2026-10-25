"use client"

import { MotionConfig } from "framer-motion"
import type { ReactNode } from "react"

// Honours the OS-level reduced-motion setting across every framer-motion
// animation in the app: with reducedMotion="user", transform and layout
// animations are disabled for users who asked for reduced motion, while
// opacity fades remain. The CSS reveal animations have their own
// prefers-reduced-motion fallback in globals.css.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
