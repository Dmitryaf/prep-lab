import { createStudyChat } from "../study-chat.ts";
import {
  getDiscussions,
  getPrompts,
  getSettings,
} from "../infrastructure/storage/runtime.ts";
import { readBundledPrompts } from "../infrastructure/prompts/bundled.ts";
import { discussionPrompt } from "./discussion-prompt.ts";

// A single active transport/history owner per Nitro process.
export const discussions = createStudyChat({
  preparePrompt: discussionPrompt(
    readBundledPrompts,
    getPrompts,
    () => getSettings().read().settings.profile,
  ),
  history: {
    read: (key) => getDiscussions().read(key),
    save: (value) => getDiscussions().save(value),
  },
});
