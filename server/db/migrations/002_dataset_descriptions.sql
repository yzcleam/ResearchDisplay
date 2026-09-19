CREATE TABLE dataset_descriptions (
  dataset_file_id uuid PRIMARY KEY REFERENCES file_mappings(id) ON DELETE RESTRICT,
  profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  descriptions jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(descriptions) = 'array'),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  parsed_at timestamptz NOT NULL DEFAULT now(),
  saved_at timestamptz
);
COMMENT ON TABLE dataset_descriptions IS '每个数据集文件版本的预解析字段与在线填写的数据说明';
COMMENT ON COLUMN dataset_descriptions.profile IS '工作表、字段ID、自动识别类型、建议面板标识、行数和检查提示';
COMMENT ON COLUMN dataset_descriptions.descriptions IS '按解析字段key关联的面板标识、中文名称、解释和来源';
