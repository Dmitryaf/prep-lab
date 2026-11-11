import type Database from "better-sqlite3";
import {
  emptyIntensiveState,
  intensiveSnapshotSchema,
  intensiveStateSchema,
  intensiveRevisionSchema,
  type IntensiveState,
} from "#domain/intensive/contracts.ts";
import { RevisionConflict } from "#server/infrastructure/storage/preparation.ts";

export class IntensiveRepository {
  private readonly database: Database.Database;
  constructor(database: Database.Database) {
    this.database = database;
  }
  read() {
    const body = this.database
      .prepare("SELECT value FROM instance_meta WHERE key='intensive:v1'")
      .pluck()
      .get();
    return body === undefined
      ? { state: emptyIntensiveState(), revision: 0 }
      : intensiveSnapshotSchema.parse(JSON.parse(String(body)));
  }
  update(
    expectedRevision: number,
    transform: (state: IntensiveState) => IntensiveState,
  ) {
    intensiveRevisionSchema.parse(expectedRevision);
    return this.database
      .transaction(() => {
        const current = this.read();
        if (current.revision !== expectedRevision)
          throw new RevisionConflict(
            "Интенсив изменился в другой вкладке. Обновите страницу перед сохранением.",
          );
        const snapshot = {
          state: intensiveStateSchema.parse(transform(current.state)),
          revision: current.revision + 1,
        };
        this.database
          .prepare(
            "INSERT INTO instance_meta (key,value) VALUES ('intensive:v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          )
          .run(JSON.stringify(snapshot));
        return snapshot;
      })
      .immediate();
  }
}
