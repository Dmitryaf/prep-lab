import { IntensiveService } from "./service.ts";
import { IntensiveRepository } from "#server/infrastructure/intensive/repository.ts";
import {
  getDatabase,
  getSources,
  getAnalysisRepository,
  getReviewedProjects,
} from "#server/infrastructure/storage/runtime.ts";
import { readKnowledge } from "#server/application/knowledge.ts";
import { readBundledKnowledge } from "#server/infrastructure/knowledge/bundled.ts";
import { sourceKnowledge } from "#domain/source/knowledge.ts";
import { readProjectCatalog } from "#server/infrastructure/projects/catalog.ts";

export function intensive() {
  return new IntensiveService({
    repository: new IntensiveRepository(getDatabase()),
    knowledge: async () =>
      getAnalysisRepository().knowledge(
        sourceKnowledge(
          await readKnowledge({ common: readBundledKnowledge }),
          getSources().snapshot().sources,
        ),
      ),
    projects: () => getReviewedProjects().catalog(readProjectCatalog()),
  });
}
