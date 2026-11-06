import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  projectCatalogSchema,
  type ProjectCatalog,
} from "#domain/projects/catalog.ts";
import { projectFromDraft } from "#domain/projects/from-draft.ts";
import type { ProjectDraft } from "#domain/projects/draft.ts";
import type { Generation } from "#domain/generation/contracts.ts";
import { GenerationRepository } from "./generations.ts";
import { RevisionConflict } from "./preparation.ts";
export class ProjectRepository {
  private readonly database: Database.Database;
  constructor(database: Database.Database) {
    this.database = database;
  }
  revision() {
    return Number(
      this.database
        .prepare("SELECT value FROM instance_meta WHERE key='content_revision'")
        .pluck()
        .get(),
    );
  }
  catalog(base: ProjectCatalog) {
    const result: ProjectCatalog = {
      ...base,
      projects: { ...base.projects },
      topics: [...base.topics],
      experience: { ...base.experience },
    };
    for (const body of this.database
      .prepare(
        "SELECT value FROM instance_meta WHERE key LIKE 'project:%' ORDER BY key",
      )
      .pluck()
      .all()) {
      const next = projectCatalogSchema.parse(JSON.parse(String(body)));
      for (const id of Object.keys(next.projects))
        if (Object.hasOwn(result.projects, id))
          throw new Error("Повторяется ID проекта.");
      Object.assign(result.projects, next.projects);
      Object.assign(result.experience, next.experience);
      result.topics.push(...next.topics);
    }
    return projectCatalogSchema.parse(result);
  }
  accept(job: Generation, draft: ProjectDraft, revision: number) {
    return this.database
      .transaction(() => {
        const jobs = new GenerationRepository(this.database),
          current = jobs.read(job.id);
        if (current.status === "accepted" && current.projectId)
          return { projectId: current.projectId };
        if (current.status !== "completed")
          throw new Error("Незавершённый результат нельзя принять.");
        if (this.revision() !== revision || job.revision !== revision)
          throw new RevisionConflict(
            "Материалы изменились. Откройте текущую версию перед разбором.",
          );
        const project = projectFromDraft(draft, job.input, randomUUID);
        this.database
          .prepare("INSERT INTO instance_meta VALUES (?,?)")
          .run("project:" + project.id, JSON.stringify(project.catalog));
        this.database
          .prepare(
            "UPDATE instance_meta SET value=? WHERE key='content_revision'",
          )
          .run(String(revision + 1));
        jobs.save({
          ...current,
          status: "accepted",
          draft,
          projectId: project.id,
        });
        return { projectId: project.id };
      })
      .immediate();
  }
}
