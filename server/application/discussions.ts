import { createStudyChat } from "../study-chat.ts";
import { getDiscussions } from "../infrastructure/storage/runtime.ts";

// A single active transport/history owner per Nitro process.
export const discussions = createStudyChat({
  history: {
    read: (key) => getDiscussions().read(key),
    save: (value) => getDiscussions().save(value),
  },
});
