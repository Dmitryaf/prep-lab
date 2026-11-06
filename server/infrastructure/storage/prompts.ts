import type Database from "better-sqlite3";
import { z } from "zod";
import {
  promptSaveSchema,
  promptStateSchema,
  type PromptTemplate,
} from "#domain/prompts/contracts.ts";
import { RevisionConflict } from "./preparation.ts";
const savedSchema = z.strictObject({
  text: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  baseVersion: z.string(),
  baseText: z.string(),
});
export class PromptRepository {
  private readonly database: Database.Database;
  constructor(database: Database.Database) {
    this.database = database;
  }
  read(template: PromptTemplate) {
    const body = this.database
      .prepare("SELECT value FROM instance_meta WHERE key=?")
      .pluck()
      .get("prompt:" + template.id);
    let saved: z.infer<typeof savedSchema> | null = null;
    try {
      if (body !== undefined)
        saved = savedSchema.parse(JSON.parse(String(body)));
    } catch {
      throw new Error(
        "Сохранённый промпт повреждён. Исходная запись сохранена.",
      );
    }
    const customized = saved?.text !== null && saved?.text !== undefined;
    return promptStateSchema.parse({
      template,
      text: customized ? saved!.text : template.text,
      revision: saved?.revision || 0,
      customized,
      needsReview: customized && saved?.baseVersion !== template.version,
      previousBase: saved?.baseText || template.text,
    });
  }
  save(template: PromptTemplate, input: z.input<typeof promptSaveSchema>) {
    const options = promptSaveSchema.parse(input);
    return this.database
      .transaction(() => {
        const current = this.read(template);
        if (current.revision !== options.revision)
          throw new RevisionConflict(
            "Промпт изменён в другой вкладке. Откройте текущую версию.",
          );
        if (options.baseVersion !== template.version)
          throw new RevisionConflict(
            "Встроенный шаблон обновился. Сравните версии перед сохранением.",
          );
        const body = JSON.stringify({
          text: options.text,
          revision: current.revision + 1,
          baseVersion: template.version,
          baseText: template.text,
        });
        this.database
          .prepare(
            "INSERT INTO instance_meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          )
          .run("prompt:" + template.id, body);
        return this.read(template);
      })
      .immediate();
  }
}
