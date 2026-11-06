import type Database from "better-sqlite3";
import {
  settingsEnvelopeSchema,
  instanceSettingsSchema,
} from "#domain/instance/contracts.ts";
import { RevisionConflict } from "./preparation.ts";

export class SettingsRepository {
  private readonly database: Database.Database;
  constructor(database: Database.Database) {
    this.database = database;
  }
  read() {
    const row = this.database
      .prepare("SELECT value FROM instance_meta WHERE key='settings'")
      .pluck()
      .get();
    return settingsEnvelopeSchema.parse(
      row === undefined
        ? { settings: { sourceRoot: "", profile: "vue" }, revision: 0 }
        : JSON.parse(String(row)),
    );
  }
  save(input: unknown, expectedRevision: number) {
    const settings = instanceSettingsSchema.parse(input);
    return this.database
      .transaction(() => {
        const current = this.read();
        if (current.revision !== expectedRevision)
          throw new RevisionConflict(
            "Настройки изменены в другой вкладке. Проверьте текущую версию и повторите изменение.",
          );
        const next = { settings, revision: current.revision + 1 };
        this.database
          .prepare(
            "INSERT INTO instance_meta VALUES ('settings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          )
          .run(JSON.stringify(next));
        return next;
      })
      .immediate();
  }
  migrateSourceRoot(sourceRoot: string) {
    return this.database
      .transaction(() => {
        const current = this.read();
        if (
          this.database
            .prepare(
              "SELECT id FROM applied_migrations WHERE id='browser-source-root-v1'",
            )
            .get()
        )
          return current;
        const next = this.save(
          {
            ...current.settings,
            sourceRoot: current.settings.sourceRoot || sourceRoot,
          },
          current.revision,
        );
        this.database
          .prepare(
            "INSERT INTO applied_migrations VALUES ('browser-source-root-v1',?)",
          )
          .run(new Date().toISOString());
        return next;
      })
      .immediate();
  }
}
