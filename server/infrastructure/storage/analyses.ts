import type Database from "better-sqlite3";
import {
  analysisJobSchema,
  type AnalysisRecord,
} from "#domain/analysis/contracts.ts";
import {
  applyKnowledgeOverlays,
  type KnowledgeOverlay,
} from "#domain/analysis/knowledge.ts";
import type { Knowledge } from "#domain/knowledge/material.ts";

export class AnalysisRepository {
  readonly database: Database.Database;
  constructor(database: Database.Database) {
    this.database = database;
  }
  private entries(prefix: string) {
    return this.database
      .prepare("SELECT value FROM instance_meta WHERE key LIKE ? ORDER BY key")
      .pluck()
      .all(prefix + "%")
      .map((value) => JSON.parse(String(value)));
  }
  save(record: AnalysisRecord) {
    analysisJobSchema.parse(record.job);
    this.database
      .prepare(
        "INSERT INTO instance_meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run("analysis:" + record.job.id, JSON.stringify(record));
  }
  read(id: string): AnalysisRecord {
    const value = this.database
      .prepare("SELECT value FROM instance_meta WHERE key=?")
      .pluck()
      .get("analysis:" + id);
    if (value === undefined) throw new Error("Анализ не найден.");
    const record = JSON.parse(String(value)) as AnalysisRecord;
    analysisJobSchema.parse(record.job);
    return record;
  }
  list(): AnalysisRecord[] {
    return this.entries("analysis:").sort((a, b) =>
      b.job.createdAt.localeCompare(a.job.createdAt),
    );
  }
  revision() {
    return Number(
      this.database
        .prepare("SELECT value FROM instance_meta WHERE key='content_revision'")
        .pluck()
        .get(),
    );
  }
  recover() {
    for (const record of this.list())
      if (record.job.status === "running") {
        record.job.status = "cancelled";
        record.job.stage = "Анализ прерван";
        record.job.error =
          "Сервер перезапущен. Можно запустить анализ повторно.";
        this.save(record);
      }
  }
  knowledge(base: Knowledge) {
    const overlays = this.entries("analysis-note:") as KnowledgeOverlay[];
    const applicable = overlays.filter((overlay) => {
      const current = base.notes.find((note) => note.id === overlay.note.id);
      return (
        !current ||
        overlay.baseMarkdown === undefined ||
        current.markdown === overlay.baseMarkdown
      );
    });
    const result = applyKnowledgeOverlays(base, applicable);
    if (applicable.length !== overlays.length)
      result.warnings = [
        ...base.warnings,
        "Некоторые материалы изменены после анализа. Проверьте обновления подключённой папки.",
      ];
    return result;
  }
  saveOverlay(overlay: KnowledgeOverlay) {
    const stored = this.database
      .prepare("SELECT value FROM instance_meta WHERE key=?")
      .pluck()
      .get("analysis-note:" + overlay.note.id);
    if (stored !== undefined) {
      const previous = JSON.parse(String(stored)) as KnowledgeOverlay;
      if (overlay.baseMarkdown === previous.note.markdown) {
        if (previous.baseMarkdown !== undefined)
          overlay.baseMarkdown = previous.baseMarkdown;
        else delete overlay.baseMarkdown;
      }
    }
    this.database
      .prepare(
        "INSERT INTO instance_meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run("analysis-note:" + overlay.note.id, JSON.stringify(overlay));
  }
}
