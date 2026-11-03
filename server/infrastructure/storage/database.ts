import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const applicationId = 0x464c4142;
export function openDatabase(path: string) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const database = new Database(path);
  try {
    const id = database.pragma("application_id", { simple: true });
    const count = database
      .prepare(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .pluck()
      .get();
    if (id !== applicationId && (id !== 0 || count !== 0))
      throw new Error("Файл данных принадлежит другому приложению.");
    const version = database.pragma("user_version", { simple: true });
    if (typeof version !== "number" || version > 2)
      throw new Error("Версия файла данных не поддерживается.");
    if (version >= 1) {
      const tables = new Set(
        database
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .pluck()
          .all(),
      );
      const expected = [
        "instance_meta",
        "question_marks",
        "topic_marks",
        "interview_sessions",
        "applied_migrations",
        "discussion_histories",
      ];
      if (version >= 2)
        expected.push(
          "sources",
          "source_documents",
          "source_previews",
          "source_versions",
          "source_roots",
        );
      if (expected.some((name) => !tables.has(name)))
        throw new Error(
          "Структура файла данных повреждена. Исходный файл сохранён.",
        );
    } else if (count !== 0)
      throw new Error("Неизвестная структура файла данных.");
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.transaction(() => {
      database.pragma(`application_id = ${applicationId}`);
      database.exec(`
        CREATE TABLE IF NOT EXISTS instance_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT OR IGNORE INTO instance_meta VALUES ('preparation_revision', '0');
        INSERT OR IGNORE INTO instance_meta VALUES ('active_session', 'null');
        CREATE TABLE IF NOT EXISTS question_marks (id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS topic_marks (id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS interview_sessions (namespace TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(namespace,id));
        CREATE TABLE IF NOT EXISTS applied_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS discussion_histories (key TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sources (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
          root_id TEXT, revision INTEGER NOT NULL, include_interviews INTEGER NOT NULL, applied_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS source_documents (
          id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), path TEXT NOT NULL, body TEXT NOT NULL,
          UNIQUE(source_id,path COLLATE NOCASE)
        );
        CREATE TABLE IF NOT EXISTS source_previews (
          id TEXT PRIMARY KEY, source_id TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS source_versions (
          source_id TEXT NOT NULL REFERENCES sources(id), revision INTEGER NOT NULL, body TEXT NOT NULL, applied_at TEXT NOT NULL,
          PRIMARY KEY(source_id,revision)
        );
        CREATE TABLE IF NOT EXISTS source_roots (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, kind TEXT NOT NULL
        );
        INSERT OR IGNORE INTO instance_meta VALUES ('content_revision','0');
      `);
      database.pragma("user_version = 2");
    })();
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
