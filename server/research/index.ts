export { assertCanEditResearch, assertCurrentVersion, type ResearchState } from './model.js';
export {
  advanceVersion,
  createRecord,
  lockEditableResearch,
  recordLatestActivity,
  saveDocuments,
  updateRecord,
} from './service.js';
