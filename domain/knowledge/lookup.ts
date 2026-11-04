import type { Note } from "./material.ts";
import { canonicalNotePath } from "./path.ts";
export function findMaterial(
  notes: Note[],
  id: string,
  sourceId?: string,
): Note | undefined {
  const canonical = canonicalNotePath(id),
    exact = notes.filter((note) => note.id === canonical);
  if (exact.some((note) => note.sourceId === sourceId) || !sourceId)
    return exact.length === 1 ? exact[0] : undefined;
  const scoped = notes.filter((note) => note.sourceId === sourceId);
  const paths = scoped.filter(
    (note) => canonicalNotePath(note.path) === canonical,
  );
  if (paths.length) return paths.length === 1 ? paths[0] : undefined;
  const aliases = scoped.filter((note) =>
    note.aliases?.some((alias) => canonicalNotePath(alias) === canonical),
  );
  if (aliases.length) return aliases.length === 1 ? aliases[0] : undefined;
  return exact.length === 1 ? exact[0] : undefined;
}
