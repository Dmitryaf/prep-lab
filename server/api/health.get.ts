import { defineEventHandler } from "nuxt/server";
import { workspaceId } from "#server/infrastructure/workspace.ts";
export default defineEventHandler(() => ({
  application: "projects-map",
  workspace: workspaceId,
  autoClose: false,
}));
