import { useEffect, useState } from "react"

/**
 * A loading label that escalates while a prediction call runs.
 *
 * The ML service is a free-tier Space that sleeps when idle, so a cold
 * start can take most of a minute. Instead of one static label, after
 * ~3s the label says the model is waking, and after ~15s it sets the
 * expectation honestly. Purely a label — the call itself is unchanged.
 */
export function useStagedLoadingLabel(active: boolean, initialLabel: string): string {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (!active) {
      setStage(0)
      return
    }
    setStage(0)
    const wakeTimer = setTimeout(() => setStage(1), 3000)
    const stillTimer = setTimeout(() => setStage(2), 15000)
    return () => {
      clearTimeout(wakeTimer)
      clearTimeout(stillTimer)
    }
  }, [active])

  if (!active || stage === 0) return initialLabel
  if (stage === 1) return "Waking the model…"
  return "Still working — free models sleep when idle"
}
