-- ============================================================================
-- QA Round 2 — auth/admin hardening (migration 21).
-- Applies AFTER 20261025200000_qa_round1_security.sql (migration 20) on a
-- database that already has migrations 1–19 + 20. Like migration 20, every
-- function is CREATE OR REPLACE and every policy is DROP IF EXISTS +
-- CREATE, so the file is safe to re-run.
--
--  1) handle_new_user(): the hospital_id metadata cast from migration 20
--     is made safe. `(meta->>'hospital_id')::uuid` throws on a malformed
--     value (failing the whole signup) and silently honours any
--     well-formed value. Now the value is used only when it parses as a
--     uuid AND names an existing hospital; anything else stores NULL and
--     an administrator assigns the hospital later (security L7).
--  2) prevent_self_role_escalation(): service-role writes are permitted
--     EXPLICITLY. Under the admin API's service-role client auth.uid()
--     is NULL and get_my_role() is NULL, so migration 20's guard let
--     those writes through only by PL/pgSQL NULL semantics — a future
--     coalesce() "cleanup" would have silently broken every admin role
--     change (security L7 / data-integrity M5). The application routes
--     verify the caller is a super admin before using that client.
--  3) profiles.hospital_id guard trigger: hospital assignment decides
--     which hospital's patients a user can see, but only the ROLE column
--     was guarded — any signed-in user could reassign THEMSELVES to
--     another hospital from Settings/onboarding and inherit its scope
--     (data-integrity C1, CRITICAL). The self-service forms no longer
--     offer the field (app fix); this trigger is the DB backstop for
--     writes that bypass the forms.
--  4) Clinical-table RLS: doctor access now requires an APPROVED doctors
--     row, via the new public.is_approved_doctor() helper. Approval was
--     previously a UI/middleware condition only — a pending or rejected
--     doctor holding a session and a hospital_id could read AND write
--     same-hospital patients, vitals, labs, diagnoses, predictions,
--     explanations and alerts straight through PostgREST
--     (persona-unapproved-doctor F1). The doctor-facing policies on
--     patients, vitals, lab_results, medications, diagnoses,
--     predictions, explanations, doctor_patient_assignments and alerts
--     are amended; nurse / hospital_admin / super_admin /
--     data_scientist branches are preserved.
--     Two deliberate side-effects of this rewrite, both tightening:
--       * The old "staff read" policies carried NO role condition at
--         all (alerts F1 flagged this) — any account whose profile had
--         a hospital_id, including a PATIENT who picked a hospital at
--         onboarding, matched them. The replacements name the staff
--         roles explicitly (plus approved doctors); patients lose a
--         read they were never meant to have and no app surface uses.
--       * The amended read policies are renamed "staff read" ->
--         "clinical read" to reflect the explicit role list.
--  5) predictions/explanations INSERT widened to the roles the app lets
--     run predictions (data-integrity M3/M9): the policies were
--     doctor-only, so a hospital_admin's New Patient flow saved the
--     patient and vitals, then had the prediction insert refused by
--     RLS — every time. Approved doctor (as before), hospital_admin
--     and nurse may now insert, same-hospital scoped, plus the matching
--     predictions UPDATE policy for the feature-snapshot follow-up
--     write those flows perform.
--  6) audit_logs SELECT scoping (super-admin SA-2): the policy granted
--     EVERY hospital_admin the unscoped trail, including full
--     before/after patient-record JSON from other hospitals.
--     hospital_admin now sees only entries whose ACTOR belongs to
--     their hospital; system rows (actor NULL — service-role/trigger
--     writes) are super-admin-only. Super admin still sees everything.
--  7) profiles phone backfill (cluster 21): the app now reads/writes
--     ONE phone column, contact_number. Values users saved into the
--     legacy `phone` column via Settings are copied across so nothing
--     they entered disappears from the directory.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) handle_new_user(): safe hospital_id handling.
--    Identical to migration 20's version except for the hospital block.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_role public.user_role;
  v_hospital_id uuid;
begin
  -- SECURITY: only honour self-service roles. Anything else a client puts
  -- in signup metadata ('super_admin', 'hospital_admin', 'nurse',
  -- 'data_scientist') is discarded and the account starts as a patient.
  v_role := case
    when new.raw_user_meta_data->>'role' in ('patient', 'doctor')
      then (new.raw_user_meta_data->>'role')::public.user_role
    else 'patient'::public.user_role
  end;

  -- Hospital affiliation from metadata is accepted only when it parses
  -- as a uuid AND names a hospital that exists. The migration-20 version
  -- cast the raw text directly: a malformed value made the cast throw
  -- (failing the signup outright), and any well-formed arbitrary value
  -- self-assigned affiliation before anyone reviewed the account.
  v_hospital_id := null;
  if new.raw_user_meta_data->>'hospital_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    select h.id into v_hospital_id
    from public.hospitals h
    where h.id = (new.raw_user_meta_data->>'hospital_id')::uuid;
  end if;

  insert into public.profiles (id, full_name, role, hospital_id, department, avatar_url, email, notification_prefs)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_role,
    v_hospital_id,
    coalesce(new.raw_user_meta_data->>'department', ''),
    new.raw_user_meta_data->>'avatar_url',
    new.email,
    '{"in_app": true, "email": true, "sms": false}'::jsonb
  );

  if v_role = 'doctor' and new.raw_user_meta_data->>'license_number' is not null then
    insert into public.doctors (user_id, license_number, hospital, specialization, experience, phone, status)
    values (
      new.id,
      new.raw_user_meta_data->>'license_number',
      new.raw_user_meta_data->>'hospital',
      new.raw_user_meta_data->>'specialization',
      -- Hardened cast (QA Round 3, onboarding O-8): a fractional or
      -- non-numeric metadata value ('5.5') used to crash the whole
      -- signup inside this trigger. Non whole-number input now stores
      -- NULL instead of failing the account creation.
      case when (new.raw_user_meta_data->>'experience') ~ '^\d+$'
        then (new.raw_user_meta_data->>'experience')::integer else null end,
      new.raw_user_meta_data->>'phone',
      'pending'
    );
  end if;

  if v_role = 'patient' then
    insert into public.patient_profiles (user_id, phone)
    values (new.id, new.raw_user_meta_data->>'phone');
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 2) prevent_self_role_escalation(): explicit service-role permit.
--    Identical to migration 20's version apart from the early return.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_self_role_escalation()
returns trigger as $$
begin
  -- Service-role writes (the admin API) carry no user session:
  -- auth.uid() and get_my_role() are both NULL. Permit them explicitly
  -- here — the API routes verify the caller is a super admin in
  -- application code before touching the service-role client, and the
  -- trigger's silence-by-NULL was one refactor away from breaking.
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role then
    if not (
      public.get_my_role() = 'super_admin'
      or (public.get_my_role() = 'hospital_admin' and old.hospital_id = public.get_my_hospital_id())
      or coalesce(current_setting('app.allow_role_change', true), 'false') = 'true'
    ) then
      raise exception 'Only administrators can change a user''s role.';
    end if;
    -- Granting super_admin is reserved to an existing super_admin actor;
    -- a hospital_admin's authority stops at their own facility's roles.
    if new.role = 'super_admin'::public.user_role
       and public.get_my_role() = 'hospital_admin' then
      raise exception 'Only a super admin can grant the super_admin role.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 3) profiles.hospital_id change guard.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_hospital_reassignment()
returns trigger as $$
begin
  if new.hospital_id is distinct from old.hospital_id then
    if not (
      auth.role() = 'service_role'
      -- First assignment by the account owner (QA Round 3, onboarding
      -- O-4): onboarding legitimately writes NULL -> hospital when a
      -- patient picks their care hospital. Without this exemption this
      -- trigger rejects onboarding's own first write and breaks the
      -- flow the day this migration is applied. It is safe alongside
      -- section 4 below: the amended clinical policies key on role +
      -- approval, not on a patient's hospital_id alone. Re-assignment
      -- (hospital -> a different hospital) stays admin-only.
      or (old.hospital_id is null and auth.uid() = old.id and public.get_my_role() = 'patient')
      or public.get_my_role() in ('super_admin', 'hospital_admin')
      -- Same vetted-RPC escape hatch the role guard honours
      -- (request_doctor_role sets this GUC inside its transaction).
      or coalesce(current_setting('app.allow_role_change', true), 'false') = 'true'
    ) then
      raise exception 'Only administrators can change a user''s hospital assignment.';
    end if;
    -- A hospital_admin's authority stops at their own facility: they
    -- may move users INTO it or OUT of it, never between two other
    -- hospitals.
    if public.get_my_role() = 'hospital_admin'
       and old.hospital_id is distinct from public.get_my_hospital_id()
       and new.hospital_id is distinct from public.get_my_hospital_id() then
      raise exception 'Hospital admins can only move users into or out of their own hospital.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists prevent_hospital_reassignment_trigger on public.profiles;
create trigger prevent_hospital_reassignment_trigger
  before update on public.profiles
  for each row execute procedure public.prevent_hospital_reassignment();

-- ---------------------------------------------------------------------------
-- 4) is_approved_doctor() + clinical-table policy amendments.
-- ---------------------------------------------------------------------------
create or replace function public.is_approved_doctor()
returns boolean as $$
begin
  return coalesce(
    public.get_my_role() = 'doctor'
    and exists (
      select 1 from public.doctors d
      where d.user_id = auth.uid() and d.status = 'approved'
    ),
    false
  );
end;
$$ language plpgsql security definer stable;

-- 4a) Patients: the doctor branch requires approval. Other branches
--     (super_admin, hospital_admin, nurse) are untouched.
drop policy if exists "Patients: doctor read/write assigned or same hospital" on public.patients;
create policy "Patients: doctor read/write assigned or same hospital"
  on public.patients
  for all using (
    public.is_approved_doctor()
    and (
      hospital_id = public.get_my_hospital_id()
      or exists (
        select 1 from public.doctor_patient_assignments dpa
        where dpa.patient_id = id and dpa.doctor_id = auth.uid()
      )
    )
  );

-- 4b) Vitals / lab_results / medications / diagnoses: the doctor
--     read/write branch requires approval, and the role-less "staff
--     read" branch becomes an explicit staff list + approved doctors.
drop policy if exists "Vitals: doctor read/write same hospital" on public.vitals;
create policy "Vitals: doctor read/write same hospital"
  on public.vitals for all using (
    public.is_approved_doctor()
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

drop policy if exists "Vitals: staff read same hospital" on public.vitals;
create policy "Vitals: clinical read same hospital"
  on public.vitals for select using (
    (public.get_my_role() in ('nurse', 'hospital_admin', 'data_scientist') or public.is_approved_doctor())
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

drop policy if exists "LabResults: doctor read/write same hospital" on public.lab_results;
create policy "LabResults: doctor read/write same hospital"
  on public.lab_results for all using (
    public.is_approved_doctor()
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

drop policy if exists "LabResults: staff read same hospital" on public.lab_results;
create policy "LabResults: clinical read same hospital"
  on public.lab_results for select using (
    (public.get_my_role() in ('nurse', 'hospital_admin', 'data_scientist') or public.is_approved_doctor())
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

drop policy if exists "Medications: doctor read/write same hospital" on public.medications;
create policy "Medications: doctor read/write same hospital"
  on public.medications for all using (
    public.is_approved_doctor()
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

drop policy if exists "Medications: staff read same hospital" on public.medications;
create policy "Medications: clinical read same hospital"
  on public.medications for select using (
    (public.get_my_role() in ('nurse', 'hospital_admin', 'data_scientist') or public.is_approved_doctor())
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

drop policy if exists "Diagnoses: doctor read/write same hospital" on public.diagnoses;
create policy "Diagnoses: doctor read/write same hospital"
  on public.diagnoses for all using (
    public.is_approved_doctor()
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

drop policy if exists "Diagnoses: staff read same hospital" on public.diagnoses;
create policy "Diagnoses: clinical read same hospital"
  on public.diagnoses for select using (
    (public.get_my_role() in ('nurse', 'hospital_admin', 'data_scientist') or public.is_approved_doctor())
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

-- 4c) Predictions: reads follow the same rule; the doctor INSERT and
--     the migration-20 snapshot UPDATE require approval.
drop policy if exists "Predictions: staff read same hospital" on public.predictions;
create policy "Predictions: clinical read same hospital"
  on public.predictions for select using (
    (public.get_my_role() in ('nurse', 'hospital_admin', 'data_scientist') or public.is_approved_doctor())
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

drop policy if exists "Predictions: doctor insert same hospital" on public.predictions;
create policy "Predictions: doctor insert same hospital"
  on public.predictions for insert with check (
    public.is_approved_doctor()
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

drop policy if exists "Predictions: doctor update same hospital" on public.predictions;
create policy "Predictions: doctor update same hospital"
  on public.predictions for update
  using (
    public.is_approved_doctor()
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  )
  with check (
    public.is_approved_doctor()
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

-- 4d) Explanations: same treatment as predictions.
drop policy if exists "Explanations: staff read same hospital" on public.explanations;
create policy "Explanations: clinical read same hospital"
  on public.explanations for select using (
    (public.get_my_role() in ('nurse', 'hospital_admin', 'data_scientist') or public.is_approved_doctor())
    and exists (
      select 1 from public.predictions pr
      join public.patients p on p.id = pr.patient_id
      where pr.id = prediction_id and p.hospital_id = public.get_my_hospital_id()
    )
  );

drop policy if exists "Explanations: doctor insert same hospital" on public.explanations;
create policy "Explanations: doctor insert same hospital"
  on public.explanations for insert with check (
    public.is_approved_doctor()
    and exists (
      select 1 from public.predictions pr
      join public.patients p on p.id = pr.patient_id
      where pr.id = prediction_id and p.hospital_id = public.get_my_hospital_id()
    )
  );

-- 4e) Assignments: migration 20's insert policy let ANY role='doctor'
--     account self-assign any patient, which then satisfied the
--     assignment branch of the patients policy. Approval required.
drop policy if exists "Assignments: staff insert own" on public.doctor_patient_assignments;
create policy "Assignments: staff insert own"
  on public.doctor_patient_assignments for insert
  with check (
    doctor_id = auth.uid()
    and (public.get_my_role() in ('nurse', 'data_scientist') or public.is_approved_doctor())
    and hospital_id = public.get_my_hospital_id()
  );

-- 4f) Alerts: the read policy had NO role condition at all, and the
--     update/insert paths trusted role='doctor' without approval.
drop policy if exists "Alerts: staff read same hospital" on public.alerts;
create policy "Alerts: clinical read same hospital"
  on public.alerts for select using (
    (public.get_my_role() in ('nurse', 'hospital_admin', 'data_scientist') or public.is_approved_doctor())
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

drop policy if exists "Alerts: staff update alert status same hospital" on public.alerts;
create policy "Alerts: staff update alert status same hospital"
  on public.alerts for update
  using (
    (public.get_my_role() in ('hospital_admin', 'nurse') or public.is_approved_doctor())
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  )
  with check (
    public.get_my_role() in ('hospital_admin', 'nurse') or public.is_approved_doctor()
  );

drop policy if exists "Alerts: system insert" on public.alerts;
create policy "Alerts: system insert"
  on public.alerts for insert with check (
    (public.get_my_role() in ('hospital_admin', 'nurse') or public.is_approved_doctor())
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

-- ---------------------------------------------------------------------------
-- 5) Predictions/explanations INSERT for the other roles the app admits
--    to the run-prediction flows (hospital_admin, nurse), same-hospital
--    scoped, plus the predictions UPDATE the snapshot write needs.
-- ---------------------------------------------------------------------------
drop policy if exists "Predictions: staff insert same hospital" on public.predictions;
create policy "Predictions: staff insert same hospital"
  on public.predictions for insert with check (
    public.get_my_role() in ('hospital_admin', 'nurse')
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

drop policy if exists "Predictions: staff update same hospital" on public.predictions;
create policy "Predictions: staff update same hospital"
  on public.predictions for update
  using (
    public.get_my_role() in ('hospital_admin', 'nurse')
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  )
  with check (
    public.get_my_role() in ('hospital_admin', 'nurse')
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );

drop policy if exists "Explanations: staff insert same hospital" on public.explanations;
create policy "Explanations: staff insert same hospital"
  on public.explanations for insert with check (
    public.get_my_role() in ('hospital_admin', 'nurse')
    and exists (
      select 1 from public.predictions pr
      join public.patients p on p.id = pr.patient_id
      where pr.id = prediction_id and p.hospital_id = public.get_my_hospital_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 6) Audit trail scoping: a hospital_admin sees only their own
--    hospital's actors. (The API-written admin-action rows from the
--    retrain/users routes carry the acting admin's id, so they follow
--    the same rule; rows with a NULL actor stay super-admin-only.)
-- ---------------------------------------------------------------------------
drop policy if exists "AuditLogs: super_admin and hospital_admin view" on public.audit_logs;
create policy "AuditLogs: super_admin and hospital_admin view"
  on public.audit_logs for select using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() = 'hospital_admin'
      and actor_id is not null
      and exists (
        select 1 from public.profiles actor
        where actor.id = audit_logs.actor_id
          and actor.hospital_id = public.get_my_hospital_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 7) Phone backfill: contact_number is the one phone column now.
-- ---------------------------------------------------------------------------
update public.profiles
set contact_number = phone
where contact_number is null
  and phone is not null;
