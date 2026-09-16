ALTER TABLE patients ADD COLUMN consent_version integer NOT NULL DEFAULT 1 CHECK (consent_version > 0);
ALTER TABLE audit_events DROP CONSTRAINT audit_events_entity_type_check;
ALTER TABLE audit_events ADD CHECK (entity_type IN ('patient','appointment','recall','automation'));
ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE audit_events ADD CHECK (action IN ('created','rescheduled','status_changed','consent_changed','approved','rejected','simulated','failed'));

CREATE TABLE consent_events (
  clinic_id uuid NOT NULL, id uuid NOT NULL, patient_id uuid NOT NULL,
  actor_id uuid NOT NULL, granted boolean NOT NULL, version integer NOT NULL CHECK (version > 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id,id), UNIQUE(clinic_id,patient_id,version),
  FOREIGN KEY (clinic_id,patient_id) REFERENCES patients(clinic_id,id),
  FOREIGN KEY (clinic_id,actor_id) REFERENCES staff(clinic_id,id)
);
CREATE TABLE automation_drafts (
  clinic_id uuid NOT NULL, id uuid NOT NULL, request_key uuid NOT NULL,
  recall_id uuid NOT NULL, patient_id uuid NOT NULL, recall_version integer NOT NULL CHECK (recall_version > 0),
  consent_version integer NOT NULL CHECK (consent_version > 0),
  recipient text NOT NULL, content text NOT NULL CHECK (length(content) BETWEEN 1 AND 1000),
  generator text NOT NULL DEFAULT 'recall-template-v1' CHECK (generator='recall-template-v1'),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','rejected','failed','simulated')),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  approved_by uuid, approved_at timestamptz, last_error text CHECK(last_error='mock_unavailable'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(clinic_id,id), UNIQUE(clinic_id,request_key), UNIQUE(clinic_id,recall_id,recall_version,consent_version),
  FOREIGN KEY(clinic_id,recall_id) REFERENCES recalls(clinic_id,id),
  FOREIGN KEY(clinic_id,patient_id) REFERENCES patients(clinic_id,id),
  FOREIGN KEY(clinic_id,approved_by) REFERENCES staff(clinic_id,id),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CHECK (status NOT IN ('approved','failed','simulated') OR approved_by IS NOT NULL)
);
CREATE TABLE mock_delivery_receipts (
  clinic_id uuid NOT NULL, draft_id uuid NOT NULL, id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(clinic_id,draft_id), UNIQUE(id),
  FOREIGN KEY(clinic_id,draft_id) REFERENCES automation_drafts(clinic_id,id)
);
