"use client"

import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Opens the browser print dialog; "Save as PDF" in that dialog is how
 * the patient risk report is downloaded — no PDF library involved.
 */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="mr-2 h-4 w-4" />
      Print / Save as PDF
    </Button>
  )
}
