ALTER TABLE staff ADD COLUMN active boolean NOT NULL DEFAULT true;

CREATE TABLE access_tokens (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (clinic_id, staff_id) REFERENCES staff(clinic_id, id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);
CREATE TABLE recalls (
  clinic_id uuid NOT NULL,
  id uuid NOT NULL,
  patient_id uuid NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'closed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id),
  FOREIGN KEY (clinic_id, patient_id) REFERENCES patients(clinic_id, id)
);
CREATE INDEX recalls_queue ON recalls(clinic_id, due_date, id);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('patient', 'appointment', 'recall')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'rescheduled', 'status_changed')),
  entity_version integer NOT NULL CHECK (entity_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (clinic_id, actor_id) REFERENCES staff(clinic_id, id)
);
CREATE INDEX audit_events_clinic ON audit_events(clinic_id, created_at, id);
-- No patient names, contact details, request bodies, or bearer tokens in audit metadata.
