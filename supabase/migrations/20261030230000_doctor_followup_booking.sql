-- Migration 23: doctors may book follow-up appointments from the chart
--
-- The chart's "Book follow-up" action inserts an appointment for the
-- patient whose record is open. Appointments RLS had no doctor INSERT
-- path at all (patients create their own; admins have scoped ALL), so
-- the button could only ever fail for the people who use the chart.
--
-- This policy is deliberately narrow. A doctor may insert an
-- appointment only when ALL of these hold:
--   * the appointment's doctor is themselves,
--   * their profile role is doctor,
--   * the appointment's patient is a portal account linked (migration
--     22) to a clinical record the doctor is assigned to.
-- Anything else — another doctor's patients, unlinked records,
-- unassigned patients — stays refused, exactly as before.

BEGIN;

CREATE POLICY "Appointments: doctor create follow-up" ON public.appointments
  FOR INSERT
  WITH CHECK (
    doctor_id = auth.uid()
    AND get_my_role() = 'doctor'
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      JOIN public.doctor_patient_assignments dpa ON dpa.patient_id = p.id
      WHERE p.user_id = appointments.patient_id
        AND dpa.doctor_id = auth.uid()
    )
  );

COMMIT;
