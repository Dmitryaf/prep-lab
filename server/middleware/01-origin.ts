import { createError, defineEventHandler } from "nuxt/server";

export default defineEventHandler((event) => {
  if (!new URL(event.req.url).pathname.startsWith("/api/")) return;
  const host = event.req.headers.get("host") || "";
  const origin = event.req.headers.get("origin");
  const configured = process.env.FRONTEND_LAB_ORIGIN;
  const allowed = configured
    ? new URL(configured).host === host
    : /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host);
  const expected = configured || `http://${host}`;
  if (!allowed || (origin && origin !== expected))
    throw createError({
      status: 403,
      message: "Запрос с этого адреса не разрешён.",
    });
});
