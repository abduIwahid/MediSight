-- ============================================================================
-- QA Round 1 — security + integrity fixes (migration 20).
--
--  1) handle_new_user(): self-service signup metadata may only ever request
--     'patient' or 'doctor'. Any other role supplied by a client (e.g.
--     'super_admin' injected via a raw Supabase signup API call) is forced
--     to 'patient'. Admin-level roles can only be granted afterwards by an
--     administrator, never at signup.
--  2) Avatars bucket: owner-scoped write policies + size/MIME limits.
--     AvatarUploader stores objects at the bucket root as
--     "<user-id>-<random>.<ext>", so ownership is matched on that filename
--     prefix. Public read stays (avatars are displayed publicly).
--  3) Public doctor-directory policy on profiles: authenticated callers
--     only. It previously had no TO restriction, so the anon role could
--     read full approved-doctor profile rows.
--  4) Appointments: a patient may only book with an APPROVED doctor, and a
--     BEFORE UPDATE trigger limits patient updates to cancelling their own
--     booking (no reassigning doctor/time, no self-confirm/complete).
--  5) predictions.features jsonb — snapshot of the exact model input used.
--  6) Audit triggers extended to profiles + doctors (role grants and doctor
--     verification decisions are PHI-adjacent admin actions and must be in
--     the audit trail). log_phi_access() is first made table-agnostic about
--     the row id (profiles.id vs doctors.user_id).
--  7) doctors.reviewed_by / reviewed_at — who decided verification, when.
--  8) prevent_self_role_escalation(): a hospital_admin can never grant
--     'super_admin', even inside their own hospital.
--  9) profiles.role default 'doctor' -> 'patient' (legacy default from the
--     initial schema; a profile created without an explicit role must not
--     silently become clinical staff).
-- 10) Supporting write policies the corrected flows depend on: doctors may
--     record their own patient assignments (Risk Queue), and may update
--     predictions in their hospital (feature-snapshot follow-up write).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Signup role restriction (based on the latest handle_new_user definition,
--    20260807140000_doctor_verification.sql).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_role public.user_role;
begin
  -- SECURITY: only honour self-service roles. Anything else a client puts
  -- in signup metadata ('super_admin', 'hospital_admin', 'nurse',
  -- 'data_scientist') is discarded and the account starts as a patient.
  v_role := case
    when new.raw_user_meta_data->>'role' in ('patient', 'doctor')
      then (new.raw_user_meta_data->>'role')::public.user_role
    else 'patient'::public.user_role
  end;

  insert into public.profiles (id, full_name, role, hospital_id, department, avatar_url, email, notification_prefs)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_role,
    (new.raw_user_meta_data->>'hospital_id')::uuid,
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
      nullif(new.raw_user_meta_data->>'experience', '')::integer,
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
-- 2) Avatars bucket hardening.
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'avatars';

-- AvatarUploader writes "<auth.uid()>-<random>.<ext>" at the bucket root.
drop policy if exists "Users can upload avatars." on storage.objects;
create policy "Users can upload avatars."
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and storage.filename(name) like (auth.uid()::text || '-%')
  );

drop policy if exists "Users can update avatars." on storage.objects;
create policy "Users can update avatars."
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and storage.filename(name) like (auth.uid()::text || '-%')
  )
  with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and storage.filename(name) like (auth.uid()::text || '-%')
  );

drop policy if exists "Users can delete avatars." on storage.objects;
create policy "Users can delete avatars."
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and storage.filename(name) like (auth.uid()::text || '-%')
  );

-- ---------------------------------------------------------------------------
-- 3) Doctor directory: authenticated only (was readable by anon).
-- ---------------------------------------------------------------------------
drop policy if exists "Profiles: public doctor directory read access" on public.profiles;
create policy "Profiles: public doctor directory read access"
  on public.profiles
  for select
  to authenticated
  using (
    role = 'doctor'::public.user_role
    and exists (
      select 1 from public.doctors d
      where d.user_id = profiles.id and d.status = 'approved'
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Appointments: approved-doctor booking + patient-update guard.
-- ---------------------------------------------------------------------------
drop policy if exists "Appointments: patient create own" on public.appointments;
create policy "Appointments: patient create own"
  on public.appointments for insert
  with check (
    patient_id = auth.uid()
    and public.get_my_role() = 'patient'
    and exists (
      select 1 from public.doctors d
      where d.user_id = doctor_id and d.status = 'approved'
    )
  );

-- RLS WITH CHECK can only see the NEW row, so "a patient may change nothing
-- except cancelling" needs a trigger that can compare OLD vs NEW.
create or replace function public.guard_patient_appointment_update()
returns trigger as $$
begin
  if public.get_my_role() = 'patient' then
    if new.status <> 'Cancelled'::public.appointment_status
       or new.doctor_id is distinct from old.doctor_id
       or new.patient_id is distinct from old.patient_id
       or new.scheduled_at is distinct from old.scheduled_at
       or new.reason is distinct from old.reason
       or new.notes is distinct from old.notes then
      raise exception 'Patients can only cancel their own appointments.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists guard_patient_appointment_update_trigger on public.appointments;
create trigger guard_patient_appointment_update_trigger
  before update on public.appointments
  for each row execute procedure public.guard_patient_appointment_update();

-- ---------------------------------------------------------------------------
-- 5) Prediction input snapshot.
-- ---------------------------------------------------------------------------
alter table public.predictions
  add column if not exists features jsonb;

-- ---------------------------------------------------------------------------
-- 6) Audit trail for profiles + doctors.
--    log_phi_access() originally read NEW.id / OLD.id directly; doctors has
--    no id column (its PK is user_id), so derive the row id from the row
--    JSON instead. Behaviour for the existing tables is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.log_phi_access()
returns trigger as $$
declare
    actor uuid := auth.uid();
    act text;
    r_id uuid;
    old_val jsonb := null;
    new_val jsonb := null;
begin
    if TG_OP = 'INSERT' then
        act := 'INSERT';
        new_val := to_jsonb(new);
        r_id := coalesce((new_val->>'id')::uuid, (new_val->>'user_id')::uuid);
    elsif TG_OP = 'UPDATE' then
        act := 'UPDATE';
        old_val := to_jsonb(old);
        new_val := to_jsonb(new);
        r_id := coalesce((new_val->>'id')::uuid, (new_val->>'user_id')::uuid);
    elsif TG_OP = 'DELETE' then
        act := 'DELETE';
        old_val := to_jsonb(old);
        r_id := coalesce((old_val->>'id')::uuid, (old_val->>'user_id')::uuid);
    end if;

    insert into public.audit_logs (actor_id, action, table_name, row_id, old_values, new_values)
    values (actor, act, TG_TABLE_NAME, r_id, old_val, new_val);

    return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute procedure public.log_phi_access();

drop trigger if exists audit_doctors on public.doctors;
create trigger audit_doctors after insert or update or delete on public.doctors
  for each row execute procedure public.log_phi_access();

-- ---------------------------------------------------------------------------
-- 7) Doctor verification decision stamp.
-- ---------------------------------------------------------------------------
alter table public.doctors
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 8) hospital_admin can never grant super_admin (based on the latest
--    prevent_self_role_escalation definition,
--    20260807140000_doctor_verification.sql, incl. its vetted
--    request_doctor_role exception).
-- ---------------------------------------------------------------------------
create or replace function public.prevent_self_role_escalation()
returns trigger as $$
begin
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
-- 9) Safe default role for profiles created without an explicit role.
-- ---------------------------------------------------------------------------
alter table public.profiles
  alter column role set default 'patient';

-- ---------------------------------------------------------------------------
-- 10) Write policies the corrected app flows require.
-- ---------------------------------------------------------------------------
-- A clinician who registers/runs an assessment on a patient records the
-- assignment that powers their Risk Queue. Previously only admins could
-- write assignments at all, so the queue could never fill.
drop policy if exists "Assignments: staff insert own" on public.doctor_patient_assignments;
create policy "Assignments: staff insert own"
  on public.doctor_patient_assignments for insert
  with check (
    doctor_id = auth.uid()
    and public.get_my_role() in ('doctor', 'nurse', 'data_scientist')
    and hospital_id = public.get_my_hospital_id()
  );

-- The run-prediction flow writes the feature snapshot onto the prediction
-- row right after inserting it; doctors need a same-hospital UPDATE policy
-- for that follow-up write (insert/read policies already exist).
drop policy if exists "Predictions: doctor update same hospital" on public.predictions;
create policy "Predictions: doctor update same hospital"
  on public.predictions for update
  using (
    public.get_my_role() = 'doctor'
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  )
  with check (
    public.get_my_role() = 'doctor'
    and exists (select 1 from public.patients p where p.id = patient_id and p.hospital_id = public.get_my_hospital_id())
  );
