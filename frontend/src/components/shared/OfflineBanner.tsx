"use client"

import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"

// Offline notice (QA Round 3, states F-14): without it, a dropped
// connection looked exactly like the app's own error states, and
// clinical users on hospital Wi-Fi had no signal about which it was.
export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-[#D97706]/40 bg-[#D97706]/10 px-4 py-2.5 text-sm font-medium text-[#A85008]"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      You appear to be offline. Pages may fail to load until your connection returns.
    </div>
  )
}
