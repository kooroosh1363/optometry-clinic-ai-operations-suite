-- Administrative foundation only: no diagnoses, prescriptions or clinical notes.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE clinics (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE staff (
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  id uuid NOT NULL,
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
  role text NOT NULL CHECK (role IN ('administrator', 'receptionist', 'optometrist')),
  PRIMARY KEY (clinic_id, id)
);
CREATE TABLE patients (
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  id uuid NOT NULL,
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
  contact_email text,
  messaging_consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id)
);
CREATE TABLE appointments (
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  id uuid NOT NULL,
  patient_id uuid NOT NULL,
  practitioner_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'checked_in', 'completed', 'cancelled', 'no_show')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (clinic_id, id),
  FOREIGN KEY (clinic_id, patient_id) REFERENCES patients(clinic_id, id),
  FOREIGN KEY (clinic_id, practitioner_id) REFERENCES staff(clinic_id, id),
  CHECK (ends_at > starts_at),
  EXCLUDE USING gist (
    clinic_id WITH =, practitioner_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('scheduled', 'checked_in')),
  EXCLUDE USING gist (
    clinic_id WITH =, patient_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('scheduled', 'checked_in'))
);
CREATE INDEX appointments_queue ON appointments(clinic_id, starts_at, status);
-- Composite foreign keys enforce clinic-consistent references, NOT read isolation.
-- Authentication, query scoping and state transition enforcement are phase 2 gates.
