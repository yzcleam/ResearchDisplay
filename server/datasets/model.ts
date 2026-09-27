import type { DatasetDescriptionField, DatasetProfile } from '../../shared/datasets.js';

export type DatasetState = {
  dataset_file_id: string;
  profile: DatasetProfile;
  descriptions: DatasetDescriptionField[];
  revision: number;
  saved_at: string | null;
};
