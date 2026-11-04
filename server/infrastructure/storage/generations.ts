import type Database from "better-sqlite3";
import {
  generationSchema,
  type Generation,
} from "../../../domain/generation/contracts.ts";
import { RevisionConflict } from "./preparation.ts";
import type { SourcePreview } from "../../../domain/source/preview.ts";
export class GenerationRepository {
  private readonly database: Database.Database;
  constructor(database: Database.Database) {
    this.database = database;
  }
  read(id: string) {
    const body = this.database
      .prepare("SELECT value FROM instance_meta WHERE key=?")
      .pluck()
      .get("generation:" + id);
    if (body === undefined) throw new Error("Задание не найдено.");
    return generationSchema.parse(JSON.parse(String(body)));
  }
  save(input: Generation) {
    const job = generationSchema.parse(input);
    this.database
      .prepare(
        "INSERT INTO instance_meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run("generation:" + job.id, JSON.stringify(job));
    return job;
  }
  list() {
    return this.database
      .prepare("SELECT value FROM instance_meta WHERE key LIKE 'generation:%'")
      .pluck()
      .all()
      .map((body) => generationSchema.parse(JSON.parse(String(body))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  recoverInterrupted() {
    this.database
      .transaction(() => {
        for (const job of this.list())
          if (job.status === "pending")
            this.save({
              ...job,
              status: "interrupted",
              error: "Сервер перезапущен. Запрос не повторялся.",
            });
      })
      .immediate();
  }
  acceptImport(
    id: string,
    revision: number,
    draft: Generation["draft"],
    createPreview: () => SourcePreview,
  ) {
    return this.database
      .transaction(() => {
        const job = this.read(id);
        if (job.status === "accepted" && job.previewId)
          return { previewId: job.previewId };
        const current = Number(
          this.database
            .prepare(
              "SELECT value FROM instance_meta WHERE key='content_revision'",
            )
            .pluck()
            .get(),
        );
        if (job.status !== "completed")
          throw new Error("Незавершённый результат нельзя принять.");
        if (current !== revision || job.revision !== revision)
          throw new RevisionConflict(
            "Материалы изменились. Подготовьте обновление заново.",
          );
        const preview = createPreview();
        this.save({ ...job, draft, status: "accepted", previewId: preview.id });
        return { previewId: preview.id };
      })
      .immediate();
  }
}
