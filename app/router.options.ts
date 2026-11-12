import type { RouterConfig } from "nuxt/schema";
import { interviewPositions } from "#ui/shared/lib/interview-reading-position.ts";

export default {
  hashMode: true,
  scrollBehavior(to, from, saved) {
    if (to.path === "/interview" && to.fullPath !== from.fullPath) {
      const position = saved || interviewPositions.get(to.fullPath);
      if (position) return position;
    }
    if (!saved && to.path === "/practice" && from.path === "/practice")
      return false;
    if (
      !saved &&
      to.path === "/projects" &&
      from.path === "/projects" &&
      !to.query.projectTopic &&
      !from.query.projectTopic &&
      (!to.query.mode || to.query.mode === "overview") &&
      (!from.query.mode || from.query.mode === "overview")
    )
      return false;
    if (
      !saved &&
      to.path === "/projects" &&
      from.query.projectTopic &&
      !to.query.projectTopic &&
      /^[\w-]+$/.test(String(from.query.projectTopic))
    )
      return { el: `[data-topic-id="${from.query.projectTopic}"]`, top: 160 };
    return (
      saved ||
      (to.query.heading || to.fullPath === from.fullPath ? false : { top: 0 })
    );
  },
} satisfies RouterConfig;
