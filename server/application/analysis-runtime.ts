import { AnalysisService } from "./analysis.ts";
import {
  getAnalysisRepository,
  getSources,
} from "#server/infrastructure/storage/runtime.ts";
import { readKnowledge } from "./knowledge.ts";
import { readBundledKnowledge } from "#server/infrastructure/knowledge/bundled.ts";
import { sourceKnowledge } from "#domain/source/knowledge.ts";
import { answerWithCodex } from "#server/codex.ts";
let service: AnalysisService | undefined;
export function analyses() {
  return (service ??= new AnalysisService({
    repository: getAnalysisRepository(),
    knowledge: async () =>
      getAnalysisRepository().knowledge(
        sourceKnowledge(
          await readKnowledge({ common: readBundledKnowledge }),
          getSources().snapshot().sources,
        ),
      ),
    answer: answerWithCodex,
  }));
}
export async function closeAnalyses() {
  await service?.close();
  service = undefined;
}
