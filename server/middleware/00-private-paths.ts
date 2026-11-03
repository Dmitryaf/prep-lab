import { createError, defineEventHandler } from "h3";

export default defineEventHandler((event) => {
  let path: string;
  try {
    path = decodeURIComponent(event.path.split("?")[0]);
  } catch {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }
  if (
    path.includes("\\") ||
    path.includes("\0") ||
    /^\/(?:src|server|docs|artifacts|lab|openspec|@fs|\.git|\.local|\.agents|\.codex)(?:\/|$)/i.test(
      path,
    ) ||
    /^\/AGENTS.*\.md$/i.test(path)
  )
    throw createError({
      statusCode: 403,
      statusMessage: "Private workspace path",
    });
});
