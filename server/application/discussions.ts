import { createStudyChat } from "#server/study-chat.ts";
import {
  getDiscussions,
  getPrompts,
  getSettings,
  getSources,
  getReviewedProjects,
  getAnalysisRepository,
} from "#server/infrastructure/storage/runtime.ts";
import { readBundledPrompts } from "#server/infrastructure/prompts/bundled.ts";
import { discussionPrompt } from "./discussion-prompt.ts";
import { projectDiscussionContext } from "./discussion-context.ts";
import { readProjectCatalog } from "#server/infrastructure/projects/catalog.ts";

// A single active transport/history owner per Nitro process.
export const discussions = createStudyChat({
  preparePrompt: discussionPrompt(
    readBundledPrompts,
    getPrompts,
    () => getSettings().read().settings.profile,
    projectDiscussionContext({
      catalog: () => getReviewedProjects().catalog(readProjectCatalog()),
      roots: () => getSources().roots(),
      analyses: () => getAnalysisRepository().list(),
    }),
  ),
  history: {
    read: (key) => getDiscussions().read(key),
    save: (value) => getDiscussions().save(value),
  },
});
