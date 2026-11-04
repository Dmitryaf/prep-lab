import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { openDatabase } from "./database.ts";
import { PreparationRepository } from "./preparation.ts";
import { DiscussionRepository } from "./discussions.ts";
import { SettingsRepository } from "./settings.ts";
import { SourceRepository } from "./sources.ts";
import { PromptRepository } from "./prompts.ts";
import { GenerationRepository } from "./generations.ts";
import { ProjectRepository } from "./reviewed-projects.ts";

let database: ReturnType<typeof openDatabase> | undefined;
let preparation: PreparationRepository | undefined;
let discussions: DiscussionRepository | undefined;
let settings: SettingsRepository | undefined;
let sources: SourceRepository | undefined;
let prompts: PromptRepository | undefined;
let generations: GenerationRepository | undefined;
let projects: ProjectRepository | undefined;
export function privateDataDirectory() {
  const directory = resolve(
    process.env.FRONTEND_LAB_DATA_DIR || ".local",
    "instance",
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform === "win32") {
    const principal = execFileSync("whoami", [], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    execFileSync(
      "icacls",
      [directory, "/inheritance:r", "/grant:r", `${principal}:(OI)(CI)F`],
      { windowsHide: true, stdio: "pipe" },
    );
  }
  return directory;
}
export function runtimeDatabasePath() {
  return join(privateDataDirectory(), "instance.sqlite");
}
export function getDatabase() {
  return (database ??= openDatabase(runtimeDatabasePath()));
}
export function getPreparation() {
  return (preparation ??= new PreparationRepository(getDatabase()));
}
export function getSettings() {
  return (settings ??= new SettingsRepository(getDatabase()));
}
export function getSources() {
  return (sources ??= new SourceRepository(getDatabase()));
}
export function getPrompts() {
  return (prompts ??= new PromptRepository(getDatabase()));
}
export function getGenerationRepository() {
  return (generations ??= new GenerationRepository(getDatabase()));
}
export function getReviewedProjects() {
  return (projects ??= new ProjectRepository(getDatabase()));
}
export function getDiscussions() {
  return (discussions ??= new DiscussionRepository(
    getDatabase(),
    resolve(
      process.env.FRONTEND_LAB_LEGACY_CHAT_DIR || "artifacts/study-chats",
    ),
  ));
}
export function closeDatabase() {
  database?.close();
  database = undefined;
  preparation = undefined;
  discussions = undefined;
  settings = undefined;
  sources = undefined;
  prompts = undefined;
  generations = undefined;
  projects = undefined;
}
