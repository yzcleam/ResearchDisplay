DROP TABLE file_share_recipients;
DROP INDEX files_space_idx;
DROP INDEX one_current_attachment;
CREATE UNIQUE INDEX one_current_attachment ON file_mappings(research_id, role)
  WHERE is_current AND role <> 'editor_image';
ALTER TABLE file_mappings DROP COLUMN deleted_at;
ALTER TABLE file_mappings DROP COLUMN share_scope;
ALTER TABLE file_mappings DROP CONSTRAINT file_mappings_role_check;
ALTER TABLE file_mappings ADD CONSTRAINT file_mappings_role_check CHECK (role IN (
  'image_pack','dataset','indicators','manuscript','editor_image',
  'mechanism_pdf','impact_pdf','risk_pdf','policy_pdf'
));
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'member'));
