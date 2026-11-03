import Database from "better-sqlite3";

// Frozen first storage format. Do not use the current migrator to build an old-format fixture.
export function versionOneDatabase(path: string) {
  const database = new Database(path);
  database.pragma("application_id = 1179402562");
  database.exec(`
    CREATE TABLE instance_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO instance_meta VALUES ('preparation_revision','7'),('active_session','null');
    CREATE TABLE question_marks (id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE topic_marks (id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE interview_sessions (namespace TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(namespace,id));
    CREATE TABLE applied_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE discussion_histories (key TEXT PRIMARY KEY, body TEXT NOT NULL);
    INSERT INTO question_marks VALUES ('retired-question','again','2026-11-03');
  `);
  database.pragma("user_version = 1");
  return database;
}
