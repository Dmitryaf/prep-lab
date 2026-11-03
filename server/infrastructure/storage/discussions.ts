import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { z } from "zod";
import { historySchema } from "../../../domain/discussion/contracts.ts";
import type { ChatHistory } from "../../types.ts";

export class DiscussionRepository {
  private readonly database: Database.Database;
  private readonly legacyDirectory?: string;
  constructor(database: Database.Database, legacyDirectory?: string) {
    this.database = database;
    this.legacyDirectory = legacyDirectory;
    this.database.transaction(() => {
      for (const row of z
        .array(z.object({ key: z.string(), body: z.string() }))
        .parse(
          database.prepare("SELECT key,body FROM discussion_histories").all(),
        )) {
        let raw: unknown;
        try {
          raw = JSON.parse(row.body);
        } catch {
          continue;
        }
        const parsed = historySchema.safeParse(raw);
        if (
          parsed.success &&
          parsed.data.key === row.key &&
          parsed.data.messages.some((message) => message.status === "pending")
        )
          database
            .prepare("UPDATE discussion_histories SET body=? WHERE key=?")
            .run(JSON.stringify(this.interrupted(parsed.data)), row.key);
      }
    })();
  }
  private migrationKey(key: string) {
    return "chat-json:" + createHash("sha256").update(key).digest("hex");
  }
  private interrupted(history: ChatHistory): ChatHistory {
    return {
      ...history,
      messages: history.messages.map((message) =>
        message.status === "pending"
          ? { ...message, status: "interrupted" }
          : message,
      ),
    };
  }
  read(key: string): ChatHistory {
    const row = this.database
      .prepare("SELECT body FROM discussion_histories WHERE key=?")
      .get(key);
    if (row) {
      const parsed = historySchema.parse(
        JSON.parse(z.object({ body: z.string() }).parse(row).body),
      );
      if (parsed.key !== key)
        throw new Error(
          "История обсуждения повреждена. Исходные данные сохранены.",
        );
      return parsed;
    }
    const migrated = this.database
      .prepare("SELECT id FROM applied_migrations WHERE id=?")
      .get(this.migrationKey(key));
    if (migrated || !this.legacyDirectory) return { key, messages: [] };
    let original: string;
    try {
      original = readFileSync(
        join(
          this.legacyDirectory,
          createHash("sha256").update(key).digest("hex") + ".json",
        ),
        "utf8",
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { key, messages: [] };
      throw error;
    }
    const parsed = historySchema.parse(JSON.parse(original));
    if (parsed.key !== key)
      throw new Error(
        "Ключ прежней истории не совпадает. Исходный файл сохранён.",
      );
    const result = this.interrupted(parsed);
    this.save(result);
    return result;
  }
  save(value: ChatHistory) {
    const valid = historySchema.parse(value);
    this.database.transaction(() => {
      this.database
        .prepare(
          "INSERT INTO discussion_histories (key,body) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body",
        )
        .run(valid.key, JSON.stringify(valid));
      this.database
        .prepare("INSERT OR IGNORE INTO applied_migrations VALUES (?,?)")
        .run(this.migrationKey(valid.key), new Date().toISOString());
    })();
  }
}
