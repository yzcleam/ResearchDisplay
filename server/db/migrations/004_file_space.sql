ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'teacher', 'member'));

ALTER TABLE file_mappings DROP CONSTRAINT file_mappings_role_check;
ALTER TABLE file_mappings ADD CONSTRAINT file_mappings_role_check CHECK (role IN (
  'image_pack','dataset','indicators','manuscript','editor_image',
  'mechanism_pdf','impact_pdf','risk_pdf','policy_pdf','other'
));
ALTER TABLE file_mappings ADD COLUMN share_scope text NOT NULL DEFAULT 'global'
  CHECK (share_scope IN ('global', 'specific', 'private'));
ALTER TABLE file_mappings ADD COLUMN deleted_at timestamptz;
UPDATE file_mappings SET share_scope = 'private' WHERE role = 'dataset';
DROP INDEX one_current_attachment;
CREATE UNIQUE INDEX one_current_attachment ON file_mappings(research_id, role)
  WHERE is_current AND deleted_at IS NULL AND role NOT IN ('editor_image', 'other');
CREATE INDEX files_space_idx ON file_mappings(research_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE file_share_recipients (
  file_id uuid NOT NULL REFERENCES file_mappings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  PRIMARY KEY(file_id, user_id)
);
CREATE INDEX file_share_user_idx ON file_share_recipients(user_id, file_id);
