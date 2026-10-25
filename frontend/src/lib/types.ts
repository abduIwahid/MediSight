/**
 * Shared row shapes for the Supabase tables as selected by the frontend.
 * The database has no generated types in this repo, so these interfaces
 * describe the columns/joins the UI actually reads. JSONB columns
 * (demographics) are inherently loosely shaped — all fields optional.
 */

export interface PatientDemographics {
  full_name?: string
  name?: string
  first_name?: string
  firstName?: string
  last_name?: string
  lastName?: string
  age?: number | null
  gender?: string
  birth_date?: string
  dob?: string
  phone?: string
  email?: string
  [key: string]: unknown
}

export interface PredictionRow {
  id?: string
  patient_id?: string
  disease?: string | null
  probability?: number | null
  severity?: string | null
  confidence?: number | null
  model_version?: string | null
  created_at: string
  shap_values?: Record<string, number> | null
  [key: string]: unknown
}

export interface VitalRow {
  id?: string
  patient_id?: string
  type: string
  value: string
  unit?: string | null
  recorded_at?: string
}

export interface DiagnosisRow {
  id?: string
  patient_id?: string
  condition: string
  diagnosed_at?: string
}

export interface LabResultRow {
  id?: string
  patient_id?: string
  test_name: string
  value: string
  unit?: string | null
  recorded_at?: string
}

export interface PatientRow {
  id: string
  mrn?: string | null
  demographics?: PatientDemographics | null
  hospital_id?: string | null
  hospitals?: { name: string } | null
  created_at?: string
  predictions?: PredictionRow[]
  vitals?: VitalRow[]
  diagnoses?: DiagnosisRow[]
  lab_results?: LabResultRow[]
  [key: string]: unknown
}

export interface ProfileRow {
  id: string
  full_name?: string | null
  email?: string | null
  role?: string | null
  phone?: string | null
  department?: string | null
  specialty?: string | null
  bio?: string | null
  available?: boolean | null
  availability_status?: string | null
  consultation_fee?: number | null
  services?: string[] | null
  hospital_id?: string | null
  avatar_url?: string | null
  created_at?: string
  hospitals?: { name: string } | null
  [key: string]: unknown
}

export interface AppointmentRow {
  id: string
  patient_id?: string
  doctor_id?: string
  scheduled_at?: string
  appointment_date?: string
  appointment_time?: string
  reason?: string | null
  status?: string | null
  created_at?: string
  [key: string]: unknown
}

export interface AlertRow {
  id: string
  patients?: { mrn: string } | null
  patient_id?: string
  type?: string | null
  severity?: string | null
  status?: string | null
  created_at: string
  [key: string]: unknown
}

export interface AuditLogRow {
  id: string
  table_name: string
  action: string
  row_id?: string | null
  old_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
  created_at: string
  profiles?: { full_name: string | null; role?: string | null } | null
  [key: string]: unknown
}
