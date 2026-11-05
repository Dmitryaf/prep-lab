import type { Note } from "./material.ts";
import { canonicalNotePath } from "./path.ts";
import { renderMarkdown, escapeHtml, headingId } from "./rendering.ts";
import { isPublicLabResource } from "./labs.ts";

export function materialHeading(note: Partial<Note>, heading: string) {
  const visited = new Set<string>();
  while (
    note.headingAliases &&
    Object.hasOwn(note.headingAliases, heading) &&
    note.headingAliases[heading]
  ) {
    if (visited.has(heading)) return null;
    visited.add(heading);
    heading = note.headingAliases[heading];
  }
  return heading;
}

// Resolve only against the browser-visible inventory, never the vault filesystem.
export function resolveKnowledgeLink(
  raw: string,
  sourceId: string,
  noteFor: (
    id: string,
    scope?: string,
  ) => (Pick<Note, "id" | "markdown"> & Partial<Note>) | undefined,
  hrefFor: (id: string, heading: string) => string,
) {
  // eslint-disable-next-line no-control-regex -- Deliberate control-character rejection or internal Markdown sentinel.
  if (typeof raw !== "string" || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (isPublicLabResource(raw)) return raw;
  let target;
  try {
    target = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//"))
    return null;
  const [path, ...fragments] = target.split("#");
  let heading = fragments.join("#");
  const source = noteFor(sourceId);
  const scope = source?.sourceId;
  let note = noteFor(
    canonicalNotePath(path || sourceId).replace(/^\//, ""),
    scope,
  );
  if (!note && path && !path.startsWith("/")) {
    const parts = (source?.path || sourceId).split("/").slice(0, -1);
    for (const part of path.replace(/\\/g, "/").split("/")) {
      if (part === "..") {
        if (!parts.length) return null;
        parts.pop();
      } else if (part && part !== ".") parts.push(part);
    }
    note = noteFor(canonicalNotePath(parts.join("/")), scope);
  }
  if (!note) return null;
  const resolvedHeading = materialHeading(note, heading);
  if (resolvedHeading === null) return null;
  heading = resolvedHeading;
  // Use the renderer's own IDs, including qualified and callout headings.
  if (
    heading &&
    !renderMarkdown(note.markdown).includes(
      `id="${escapeHtml(headingId(heading))}"`,
    )
  )
    return null;
  return hrefFor(note.id, heading);
}
