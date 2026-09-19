CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  real_name varchar(80) NOT NULL CHECK (length(trim(real_name)) >= 2),
  institution varchar(160) NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE factor_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(80) NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE research_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title varchar(250) NOT NULL, research_type text NOT NULL CHECK (research_type IN ('要素集聚','要素流动','其他')),
  factor_type_id uuid NOT NULL REFERENCES factor_types(id) ON DELETE RESTRICT,
  economic_data_names jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(economic_data_names) = 'array'),
  mechanism_summary text NOT NULL DEFAULT '', impact_summary text NOT NULL DEFAULT '',
  risk_summary text NOT NULL DEFAULT '', policy_summary text NOT NULL DEFAULT '',
  documents jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(documents) = 'object'),
  version integer NOT NULL DEFAULT 1, latest_upload_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, factor_type_id)
);
CREATE TABLE upload_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploader_name varchar(80) NOT NULL, research_id uuid NOT NULL REFERENCES research_records(id) ON DELETE RESTRICT,
  research_title varchar(250) NOT NULL, action text NOT NULL CHECK (action IN ('create','edit','upload','document','pdf')),
  files jsonb NOT NULL DEFAULT '[]', details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id, research_id)
);
ALTER TABLE research_records ADD CONSTRAINT latest_upload_same_research_fk
  FOREIGN KEY (latest_upload_id, id) REFERENCES upload_events(id, research_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE file_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), research_id uuid NOT NULL, factor_type_id uuid NOT NULL,
  upload_id uuid NOT NULL, uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('image_pack','dataset','indicators','manuscript','editor_image','mechanism_pdf','impact_pdf','risk_pdf','policy_pdf')),
  original_name varchar(255) NOT NULL, storage_key varchar(100) NOT NULL UNIQUE,
  mime_type varchar(100) NOT NULL, size_bytes bigint NOT NULL CHECK (size_bytes > 0), sha256 char(64) NOT NULL,
  is_current boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (research_id, factor_type_id) REFERENCES research_records(id, factor_type_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (upload_id, research_id) REFERENCES upload_events(id, research_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX one_current_attachment ON file_mappings(research_id, role) WHERE is_current AND role <> 'editor_image';
CREATE INDEX research_factor_idx ON research_records(factor_type_id);
CREATE INDEX research_owner_idx ON research_records(owner_id);
CREATE INDEX research_updated_idx ON research_records(updated_at DESC);
CREATE INDEX upload_research_idx ON upload_events(research_id, created_at DESC);
CREATE INDEX upload_user_idx ON upload_events(user_id);
CREATE INDEX files_factor_idx ON file_mappings(factor_type_id, created_at DESC);
CREATE INDEX files_upload_idx ON file_mappings(upload_id);
CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token char(64) NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE pdf_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), research_id uuid NOT NULL REFERENCES research_records(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  section text NOT NULL CHECK (section IN ('mechanism','impact','risk','policy')),
  revision integer NOT NULL, html text NOT NULL, title text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','superseded')),
  attempts integer NOT NULL DEFAULT 0, error_message text, file_id uuid REFERENCES file_mappings(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_claim_idx ON pdf_jobs(status, created_at);
CREATE UNIQUE INDEX one_pending_pdf ON pdf_jobs(research_id, section, revision) WHERE status IN ('queued','running');
