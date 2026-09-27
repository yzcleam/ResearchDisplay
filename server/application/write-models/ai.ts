import type { AiGenerateInput, AiSettingsInput } from '../../../shared/ai.js';
import type { Section, User } from '../../../shared/contracts.js';
import { sections } from '../../../shared/contracts.js';
import { generateFromContext, saveAiSettings as saveSettings } from '../../ai/index.js';
import { assertAdministrator } from '../../auth/index.js';
import { documentText } from '../../documents/index.js';
import { assertCanEditResearch } from '../../research/index.js';
import { enabledFactors } from '../read-models/factors.js';
import { readResearchRecord } from '../read-models/research.js';

export { testConnection } from '../../ai/index.js';

export function saveAiSettings(user: User, input: AiSettingsInput) {
  assertAdministrator(user);
  return saveSettings(user, input);
}

export async function generateSuggestions(
  user: User,
  input: AiGenerateInput,
  signal?: AbortSignal,
) {
  const research = input.research_id ? await readResearchRecord(input.research_id) : undefined;
  if (research) {
    assertCanEditResearch(user, research);
  }
  const documents = Object.fromEntries(
    sections.map((section) => [section, documentText(research?.documents[section]?.html || '')]),
  ) as Record<Section, string>;
  return generateFromContext(
    {
      documents,
      sectionText: documentText(input.html || ''),
      factors: await enabledFactors(),
    },
    input,
    signal,
  );
}
