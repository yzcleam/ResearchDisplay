CREATE TABLE llm_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  base_url text NOT NULL,
  model varchar(200) NOT NULL,
  api_key_encrypted text,
  json_mode boolean NOT NULL DEFAULT true,
  timeout_seconds integer NOT NULL DEFAULT 60 CHECK (timeout_seconds BETWEEN 10 AND 180),
  revision integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
