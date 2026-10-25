import { classifyPayloadFeatures, FEATURE_DEFAULTS } from "@/lib/prediction-features"
import { featureLabel, formatFeatureValue } from "@/lib/feature-labels"

interface InputsUsedDisclosureProps {
  /** The payload the score was computed from (the stored snapshot when
   *  one exists, otherwise the payload re-derived from the record). */
  payload: Record<string, number>
  /** Features the patient's record supplies — from buildMLPayload.
   *  Everything else in the payload was an assumed default. */
  recordedFeatures: readonly string[]
  /** True when payload is the frozen predictions.features snapshot. */
  fromSnapshot?: boolean
}

/**
 * "Inputs used" — the honesty disclosure for a score: which inputs came
 * from the patient's record and which were population defaults, with the
 * default values named. Rendered on the prediction detail page and the
 * print report so a clinician can see how much of a score is the patient
 * and how much is the average stand-in (QA Round 2, cluster 4).
 */
export function InputsUsedDisclosure({ payload, recordedFeatures, fromSnapshot = false }: InputsUsedDisclosureProps) {
  const { recorded, assumed } = classifyPayloadFeatures(payload, recordedFeatures)

  return (
    <div className="space-y-4 text-sm">
      <p className="leading-relaxed text-muted-foreground">
        {fromSnapshot
          ? "These are the exact inputs this score was computed from, stored with the prediction."
          : "This prediction predates stored input snapshots, so its inputs are re-derived from the patient's current record — they may differ from the inputs used at the time if the record has changed since."}
      </p>

      {recorded.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            From this patient&apos;s record ({recorded.length})
          </h3>
          <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {recorded.map((name) => (
              <div key={name} className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{featureLabel(name)}</dt>
                <dd className="font-medium">{formatFeatureValue(name, payload[name])}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {assumed.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Not recorded for this patient — population defaults used ({assumed.length})
          </h3>
          <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {assumed.map((name) => (
              <div key={name} className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{featureLabel(name)}</dt>
                <dd className="font-medium">
                  {formatFeatureValue(name, payload[name] ?? FEATURE_DEFAULTS[name])}
                  <span className="ml-1.5 text-xs text-muted-foreground">(default)</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
