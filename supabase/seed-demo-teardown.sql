-- =====================================================================
-- MediSight DEMO SEED TEARDOWN  -  supabase/seed-demo-teardown.sql
-- =====================================================================
-- Removes EXACTLY the rows created by supabase/seed-demo.sql and
-- nothing else. Targets are the pack's fixed UUIDs, its
-- @demo.medisight.local login domain and its DEMO-2026-* MRNs.
-- Foreign-key cascades handle dependent rows (profiles,
-- patient_profiles, doctors, vitals, diagnoses, predictions,
-- explanations, assignments, alerts). Run in the SQL Editor or psql
-- as a privileged role. Safe to run when the seed was never applied
-- (every statement simply matches zero rows).
-- =====================================================================

BEGIN;

-- Appointments first (they reference demo profiles on both sides).
DELETE FROM public.appointments
WHERE patient_id IN (
  'd0000000-0000-4000-8000-000000000201',
  'd0000000-0000-4000-8000-000000000202',
  'd0000000-0000-4000-8000-000000000203',
  'd0000000-0000-4000-8000-000000000204',
  'd0000000-0000-4000-8000-000000000205',
  'd0000000-0000-4000-8000-000000000206',
  'd0000000-0000-4000-8000-000000000207',
  'd0000000-0000-4000-8000-000000000208'
) OR doctor_id IN (
  'd0000000-0000-4000-8000-000000000101',
  'd0000000-0000-4000-8000-000000000102',
  'd0000000-0000-4000-8000-000000000103',
  'd0000000-0000-4000-8000-000000000104',
  'd0000000-0000-4000-8000-000000000105',
  'd0000000-0000-4000-8000-000000000106',
  'd0000000-0000-4000-8000-000000000107',
  'd0000000-0000-4000-8000-000000000108',
  'd0000000-0000-4000-8000-000000000109',
  'd0000000-0000-4000-8000-000000000110',
  'd0000000-0000-4000-8000-000000000111',
  'd0000000-0000-4000-8000-000000000112'
);

-- Clinical records (cascades to vitals, diagnoses, predictions,
-- explanations, assignments and alerts for these patients).
DELETE FROM public.patients
WHERE id IN (
  'd0000000-0000-4000-8000-000000001001',
  'd0000000-0000-4000-8000-000000001002',
  'd0000000-0000-4000-8000-000000001003',
  'd0000000-0000-4000-8000-000000001004',
  'd0000000-0000-4000-8000-000000001005',
  'd0000000-0000-4000-8000-000000001006',
  'd0000000-0000-4000-8000-000000001007',
  'd0000000-0000-4000-8000-000000001008',
  'd0000000-0000-4000-8000-000000001009',
  'd0000000-0000-4000-8000-000000001010',
  'd0000000-0000-4000-8000-000000001011',
  'd0000000-0000-4000-8000-000000001012',
  'd0000000-0000-4000-8000-000000001013',
  'd0000000-0000-4000-8000-000000001014',
  'd0000000-0000-4000-8000-000000001015',
  'd0000000-0000-4000-8000-000000001016',
  'd0000000-0000-4000-8000-000000001017',
  'd0000000-0000-4000-8000-000000001018',
  'd0000000-0000-4000-8000-000000001019',
  'd0000000-0000-4000-8000-000000001020',
  'd0000000-0000-4000-8000-000000001021',
  'd0000000-0000-4000-8000-000000001022',
  'd0000000-0000-4000-8000-000000001023',
  'd0000000-0000-4000-8000-000000001024',
  'd0000000-0000-4000-8000-000000001025',
  'd0000000-0000-4000-8000-000000001026',
  'd0000000-0000-4000-8000-000000001027',
  'd0000000-0000-4000-8000-000000001028',
  'd0000000-0000-4000-8000-000000001029',
  'd0000000-0000-4000-8000-000000001030',
  'd0000000-0000-4000-8000-000000001031',
  'd0000000-0000-4000-8000-000000001032',
  'd0000000-0000-4000-8000-000000001033',
  'd0000000-0000-4000-8000-000000001034',
  'd0000000-0000-4000-8000-000000001035',
  'd0000000-0000-4000-8000-000000001036',
  'd0000000-0000-4000-8000-000000001037',
  'd0000000-0000-4000-8000-000000001038',
  'd0000000-0000-4000-8000-000000001039',
  'd0000000-0000-4000-8000-000000001040'
);

-- Login accounts (cascades to profiles, patient_profiles, doctors,
-- assignments and any remaining appointments for these users).
DELETE FROM auth.users
WHERE email LIKE '%@demo.medisight.local';

-- Demo hospitals last (demo profiles/patients that referenced them
-- are already gone; any other reference is set null by the FK).
DELETE FROM public.hospitals
WHERE id IN (
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000004'
);

COMMIT;

-- Verification (expect all zeros):
--   SELECT (SELECT count(*) FROM auth.users WHERE email LIKE '%@demo.medisight.local') AS demo_accounts,
--          (SELECT count(*) FROM public.patients WHERE mrn LIKE 'DEMO-%') AS demo_patients,
--          (SELECT count(*) FROM public.hospitals WHERE id IN ('d0000000-0000-4000-8000-000000000001')) AS demo_hospital_1;
