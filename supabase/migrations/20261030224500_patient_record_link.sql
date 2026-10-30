-- Migration 22: link clinical patient records to portal accounts
--
-- Until now the two halves of the product never met in the database:
-- `patients` holds the clinical record (staff-only RLS), while portal
-- accounts live in auth.users/profiles and appear in `appointments` by
-- user id. There was no way for a patient to see their own risk
-- assessment without widening staff policies.
--
-- This adds the missing link column and the narrowest possible reads:
-- a patient can SELECT exactly the one clinical record linked to their
-- account, plus that record's predictions, explanations and vitals.
-- Nothing about staff access changes, and patients get no write path.
--
-- Backfill covers the labelled demo pack only: its portal accounts
-- carry the same phone number in their signup metadata as the matching
-- clinical record's demographics, so the join is exact, not fuzzy.
-- Records created outside the demo pack stay unlinked (NULL) until a
-- deliberate link is made — an unlinked record is invisible to the
-- portal, which is the safe default.

BEGIN;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_user_id ON public.patients(user_id);

UPDATE public.patients p
SET user_id = u.id
FROM auth.users u
WHERE p.user_id IS NULL
  AND u.email LIKE '%@demo.medisight.local'
  AND p.demographics->>'phone' IS NOT NULL
  AND p.demographics->>'phone' = u.raw_user_meta_data->>'phone';

CREATE POLICY "Patients: patient read own record" ON public.patients
  FOR SELECT
  USING (get_my_role() = 'patient' AND user_id = auth.uid());

CREATE POLICY "Predictions: patient read own" ON public.predictions
  FOR SELECT
  USING (
    get_my_role() = 'patient'
    AND patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
  );

CREATE POLICY "Explanations: patient read own" ON public.explanations
  FOR SELECT
  USING (
    get_my_role() = 'patient'
    AND prediction_id IN (
      SELECT pr.id
      FROM public.predictions pr
      JOIN public.patients p ON p.id = pr.patient_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Vitals: patient read own" ON public.vitals
  FOR SELECT
  USING (
    get_my_role() = 'patient'
    AND patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
  );

COMMIT;
