import { ownerCatalog } from "#server/infrastructure/projects/owner.ts";
export { ownerCatalog };
import {
  sourceUrl as url,
  highlightedCode as highlight,
  sourceContext as context,
  localCodeReference,
} from "#domain/projects/sources.ts";
export const { topics, projects, codeHighlights } = ownerCatalog;
export const pilots = topics.map((topic) => topic.pilot);
export const ownerAvailable = topics.length > 0;
export const sourceUrl = (step: Parameters<typeof url>[0], revision?: string) =>
  url(step, ownerCatalog.repositories, revision);
export const highlightedCode = (pilot: Parameters<typeof highlight>[0]) =>
  highlight(pilot, codeHighlights);
export const sourceContext = (step: Parameters<typeof context>[0]) =>
  context(step, ownerCatalog.sourceLabels);
export { localCodeReference };
