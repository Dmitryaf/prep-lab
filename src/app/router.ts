import { createRouter, createWebHashHistory } from "vue-router";
import InterviewView from "../interview/InterviewView.vue";
import { canonicalNotePath } from "../knowledge/path.js";

function legacyLocation() {
  const query = new URLSearchParams(location.search),
    old = new URLSearchParams(location.hash.slice(1));
  if (old.has("topic"))
    return { path: "/projects", query: { projectTopic: old.get("topic")! } };
  if (query.has("note")) {
    const [note, ...heading] = query.get("note")!.split("#");
    return {
      path: "/themes",
      query: {
        note: canonicalNotePath(note),
        ...(heading.length ? { heading: heading.join("#") } : {}),
      },
    };
  }
  if (old.has("view")) {
    const view = old.get("view")!;
    old.delete("view");
    return { path: "/" + view, query: Object.fromEntries(old) };
  }
  if (query.has("projects")) return { path: "/projects" };
}
const legacy = legacyLocation();
if (legacy) {
  const query = new URLSearchParams(legacy.query || {}).toString();
  history.replaceState(
    null,
    "",
    location.pathname + "#" + legacy.path + (query ? "?" + query : ""),
  );
}
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/interview" },
    { path: "/interview", component: InterviewView },
    {
      path: "/practice",
      component: () => import("../practice/PracticeView.vue"),
    },
    { path: "/repeat", component: () => import("../practice/RepeatView.vue") },
    {
      path: "/themes",
      component: () => import("../knowledge/KnowledgeView.vue"),
    },
    {
      path: "/projects",
      component: () => import("../projects/ProjectsView.vue"),
    },
    { path: "/:pathMatch(.*)*", component: InterviewView },
  ],
  scrollBehavior(to, from, saved) {
    if(!saved&&to.path==='/projects'&&from.query.projectTopic&&!to.query.projectTopic&&/^[\w-]+$/.test(String(from.query.projectTopic)))return {el:`[data-topic-id="${from.query.projectTopic}"]`,top:160};
    return (
      saved ||
      (to.query.heading || to.fullPath === from.fullPath ? false : { top: 0 })
    );
  },
});
router.beforeEach((to) => {
  if (/^\/(?:view|topic)=/.test(to.path)) {
    const old = new URLSearchParams(to.fullPath.slice(1));
    if (old.has("topic"))
      return { path: "/projects", query: { projectTopic: old.get("topic")! } };
    const view = old.get("view") || "interview";
    old.delete("view");
    return { path: "/" + view, query: Object.fromEntries(old) };
  }
  if (to.matched[0]?.path === "/:pathMatch(.*)*") return "/interview";
});
export function link(view: string, query: Record<string, string> = {}) {
  return { path: "/" + view, query };
}
