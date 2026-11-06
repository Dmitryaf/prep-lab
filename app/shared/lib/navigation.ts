import { canonicalNotePath } from "#domain/knowledge/path.ts";
export function legacyLocation(search: string, hash: string) {
  const query = new URLSearchParams(search),
    old = new URLSearchParams(hash.replace(/^#\/?/, ""));
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
export function link(view: string, query: Record<string, string> = {}) {
  return { path: "/" + view, query };
}
