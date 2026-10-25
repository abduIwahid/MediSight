import { PulseLoader } from "@/components/shared/PulseLoader"

/**
 * Root loading UI — the Signature Flow brand loader, centred on the app
 * background (bg-background is applied by the root layout's body styles,
 * and every colour in the loader follows the active theme). Segments with
 * their own loading.tsx (e.g. the dashboard skeleton) keep theirs; this
 * covers everything else.
 */
export default function Loading() {
  return (
    <div
      className="flex min-h-[70vh] items-center justify-center px-6"
      aria-busy="true"
    >
      <PulseLoader />
    </div>
  )
}
