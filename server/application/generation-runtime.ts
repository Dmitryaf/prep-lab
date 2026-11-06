import { GenerationService } from "./generations.ts";
import { SourceService } from "./sources.ts";
import {
  getGenerationRepository,
  getReviewedProjects,
  getPrompts,
  getSources,
} from "#server/infrastructure/storage/runtime.ts";
import { readKnowledge } from "./knowledge.ts";
import { readBundledKnowledge } from "#server/infrastructure/knowledge/bundled.ts";
import { readBundledPrompts } from "#server/infrastructure/prompts/bundled.ts";
import { answerWithCodex } from "#server/codex.ts";
let service: GenerationService | undefined;
export function generations() {
  return (service ??= new GenerationService({
    repository: getGenerationRepository(),
    projects: getReviewedProjects(),
    prompts: getPrompts(),
    sources: new SourceService(getSources(), () =>
      readKnowledge({ common: readBundledKnowledge }),
    ),
    templates: readBundledPrompts,
    answer: answerWithCodex,
  }));
}
export async function closeGenerations() {
  await service?.close();
  service = undefined;
}
