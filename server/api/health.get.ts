import { defineEventHandler } from "nuxt/server";
import { workspaceId } from "../infrastructure/workspace.ts";
export default defineEventHandler(() => ({
  application: "projects-map",
  workspace: workspaceId,
  autoClose: false,
}));
