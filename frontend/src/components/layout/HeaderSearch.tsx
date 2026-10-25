"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

/**
 * The dashboard header's patient search, isolated into its own client
 * component: the query state used to live in the whole layout, so every
 * keystroke re-rendered the header (sidebar, bell, menus). Typing now
 * re-renders only this form. Behaviour is unchanged — submit routes to
 * /patients?search=..., and the box re-syncs from the URL on navigation.
 */
export function HeaderSearch() {
  const router = useRouter()
  const pathname = usePathname()
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    setSearchQuery(params.get("search") || "")
  }, [pathname])

  const handleSearch = (event?: React.FormEvent) => {
    event?.preventDefault()
    const readyQuery = searchQuery.trim()
    if (readyQuery) {
      router.push(`/patients?search=${encodeURIComponent(readyQuery)}`)
    }
  }

  return (
    <form onSubmit={handleSearch} className="w-full max-w-lg hidden sm:block">
      <div className="relative group">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          type="search"
          placeholder="Search patients, MRN..."
          className="h-10 w-full rounded-full border-border/50 bg-muted/30 pl-10 pr-4 text-sm shadow-inner transition-all focus:bg-background focus-visible:ring-1 focus-visible:ring-primary"
        />
      </div>
    </form>
  )
}
