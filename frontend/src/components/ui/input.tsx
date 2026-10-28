import * as React from "react"
import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // text-base below sm: iOS Safari auto-zooms on focus when a
          // field's font-size is under 16px (QA Round 2, cluster 28).
          "flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background transition-colors file:border-0 file:bg-transparent file:text-base sm:file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"
export { Input }
