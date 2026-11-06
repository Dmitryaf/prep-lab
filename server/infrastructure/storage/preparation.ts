import { z } from "zod";
import type Database from "better-sqlite3";
import type { Progress, Interview } from "#domain/interview/state.ts";
import type { Mark } from "#domain/interview/rating.ts";
import { validateState } from "#domain/interview/saved-state.ts";
import { mergeLegacyState } from "#domain/interview/migration.ts";

export class RevisionConflict extends Error {}
export class PreparationRepository {
  private readonly database: Database.Database;
  constructor(database: Database.Database) {
    this.database = database;
  }
  read() {
    const meta = z
      .array(z.object({ key: z.string(), value: z.string() }))
      .parse(
        this.database.prepare("SELECT key,value FROM instance_meta").all(),
      );
    const values = Object.fromEntries(
      meta.map((item) => [item.key, item.value]),
    );
    const revision = z
      .int()
      .nonnegative()
      .parse(Number(values.preparation_revision));
    const readMarks = (table: "question_marks" | "topic_marks") => {
      const rows = z
        .array(
          z.object({
            id: z.string(),
            status: z.enum(["done", "partial", "again"]),
            updated_at: z.string(),
          }),
        )
        .parse(
          this.database
            .prepare(`SELECT id,status,updated_at FROM ${table}`)
            .all(),
        );
      return Object.fromEntries(
        rows.map((row): [string, Mark] => [
          row.id,
          { status: row.status, updatedAt: row.updated_at },
        ]),
      );
    };
    const sessions: Record<string, Interview> = {},
      daily: Record<string, Interview> = {};
    for (const row of z
      .array(
        z.object({
          namespace: z.enum(["daily", "sessions"]),
          id: z.string(),
          body: z.string(),
        }),
      )
      .parse(
        this.database
          .prepare("SELECT namespace,id,body FROM interview_sessions")
          .all(),
      ))
      (row.namespace === "daily" ? daily : sessions)[row.id] = JSON.parse(
        row.body,
      );
    const state = validateState({
      version: 3,
      ...(values.practice_attempts !== undefined &&
      values.practice_attempts !== "null"
        ? { practiceAttempts: JSON.parse(values.practice_attempts) }
        : {}),
      progress: readMarks("topic_marks"),
      questionProgress: readMarks("question_marks"),
      sessions,
      daily,
      activeSession: JSON.parse(values.active_session),
    });
    return { state, revision };
  }
  private write(state: Progress) {
    for (const [table, marks] of [
      ["topic_marks", state.progress],
      ["question_marks", state.questionProgress],
    ] as const) {
      this.database.prepare(`DELETE FROM ${table}`).run();
      const insert = this.database.prepare(
        `INSERT INTO ${table} (id,status,updated_at) VALUES (?,?,?)`,
      );
      for (const [id, mark] of Object.entries(marks))
        insert.run(id, mark.status, mark.updatedAt || "");
    }
    this.database.prepare("DELETE FROM interview_sessions").run();
    const insert = this.database.prepare(
      "INSERT INTO interview_sessions (namespace,id,body) VALUES (?,?,?)",
    );
    for (const [namespace, entries] of [
      ["daily", state.daily],
      ["sessions", state.sessions],
    ] as const)
      for (const [id, session] of Object.entries(entries))
        insert.run(namespace, id, JSON.stringify(session));
    this.database
      .prepare("UPDATE instance_meta SET value=? WHERE key='active_session'")
      .run(JSON.stringify(state.activeSession));
    this.database
      .prepare(
        "INSERT INTO instance_meta (key,value) VALUES ('practice_attempts',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(JSON.stringify(state.practiceAttempts ?? null));
    this.database
      .prepare(
        "UPDATE instance_meta SET value=CAST(value AS INTEGER)+1 WHERE key='preparation_revision'",
      )
      .run();
  }
  save(input: unknown, expectedRevision: number) {
    const state = validateState(input);
    return this.database
      .transaction(() => {
        if (this.read().revision !== expectedRevision)
          throw new RevisionConflict(
            "Данные изменились в другой вкладке. Обновите состояние перед повторной попыткой.",
          );
        this.write(state);
        return this.read();
      })
      .immediate();
  }
  migrate(input: unknown) {
    const state = validateState(input);
    return this.database
      .transaction(() => {
        const applied = this.database
          .prepare(
            "SELECT id FROM applied_migrations WHERE id='browser-preparation-v1'",
          )
          .get();
        if (applied) return this.read();
        this.write(mergeLegacyState(this.read().state, state));
        this.database
          .prepare(
            "INSERT INTO applied_migrations VALUES ('browser-preparation-v1', ?)",
          )
          .run(new Date().toISOString());
        return this.read();
      })
      .immediate();
  }
}
