import type { FileRecord, Research } from './contracts.js';

export type DashboardStats = { research: number; files: number; factors: number; mine: number };
export type ResearchListing = { items: Research[]; total: number };
export type FactorFileListing = { items: FileRecord[]; total: number };
