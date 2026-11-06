import { defineNuxtRouteMiddleware, navigateTo } from "#app";
import { legacyLocation } from "#ui/shared/lib/navigation.ts";

export default defineNuxtRouteMiddleware((to) => {
  const legacy = legacyLocation(window.location.search, window.location.hash);
  if (
    legacy &&
    (to.path !== legacy.path ||
      Object.entries(legacy.query || {}).some(
        ([key, value]) => to.query[key] !== value,
      ))
  ) {
    if (window.location.search)
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.hash,
      );
    return navigateTo(legacy, { replace: true });
  }
  if (to.path === "/") return navigateTo("/interview", { replace: true });
  if (
    ![
      "/interview",
      "/practice",
      "/repeat",
      "/themes",
      "/projects",
      "/sources",
      "/prompts",
      "/generate",
    ].includes(to.path)
  )
    return navigateTo("/interview", { replace: true });
});
