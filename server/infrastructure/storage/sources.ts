import type Database from "better-sqlite3";
import { z } from "zod";
import {
  acceptedSourceSchema,
  previewSchema,
  acceptSourceSchema,
  type AcceptedSource,
  type AcceptSource,
} from "../../../domain/source/preview.ts";
import type { SourceDocument } from "../../../domain/source/contracts.ts";
import { RevisionConflict } from "./preparation.ts";

export class SourceRepository {
  private readonly database: Database.Database;
  constructor(database: Database.Database) {
    this.database = database;
  }
  snapshot() {
    const revision = Number(
      this.database
        .prepare("SELECT value FROM instance_meta WHERE key='content_revision'")
        .pluck()
        .get(),
    );
    const rows = this.database
      .prepare("SELECT * FROM sources ORDER BY id")
      .all() as {
      id: string;
      name: string;
      kind: string;
      root_id: string | null;
      revision: number;
      include_interviews: number;
    }[];
    const sources = rows.map((row) =>
      acceptedSourceSchema.parse({
        id: row.id,
        name: row.name,
        kind: row.kind,
        rootId: row.root_id,
        revision: row.revision,
        includeInterviews: !!row.include_interviews,
        documents: this.database
          .prepare(
            "SELECT body FROM source_documents WHERE source_id=? ORDER BY path",
          )
          .pluck()
          .all(row.id)
          .map((body) => JSON.parse(String(body))),
      }),
    );
    return { revision, sources };
  }
  savePreview(input: import("zod").input<typeof previewSchema>) {
    const preview = previewSchema.parse(input);
    if (
      Number(
        this.database
          .prepare(
            "SELECT count(*) FROM source_previews WHERE status='pending'",
          )
          .pluck()
          .get(),
      ) >= 20
    )
      throw new Error(
        "Уже открыто 20 предложений. Примите или отклоните прежние изменения.",
      );
    this.database
      .prepare("INSERT INTO source_previews VALUES (?,?,?,?,?)")
      .run(
        preview.id,
        preview.source.id,
        JSON.stringify(preview),
        preview.status,
        preview.createdAt,
      );
    return preview;
  }
  preview(id: string) {
    const body = this.database
      .prepare("SELECT body FROM source_previews WHERE id=?")
      .pluck()
      .get(id);
    if (body === undefined) throw new Error("Предложение не найдено.");
    return previewSchema.parse(JSON.parse(String(body)));
  }
  saveDraft(id: string, input: AcceptSource) {
    const options = acceptSourceSchema.parse(input);
    return this.database
      .transaction(() => {
        const preview = this.preview(id);
        if (preview.status !== "pending")
          throw new Error("Предложение уже принято или отклонено.");
        if (
          preview.revision !== options.revision ||
          this.snapshot().revision !== options.revision
        )
          throw new RevisionConflict(
            "Материалы изменились. Подготовьте обновление заново.",
          );
        const ids = new Set(preview.entries.map((entry) => entry.id));
        if (
          [
            ...Object.keys(options.resolutions),
            ...Object.keys(options.headingMatches),
          ].some((id) => !ids.has(id))
        )
          throw new Error("Правка относится к неизвестному материалу.");
        const next = previewSchema.parse({
          ...preview,
          resolutions: options.resolutions,
          headingMatches: options.headingMatches,
        });
        this.database
          .prepare("UPDATE source_previews SET body=? WHERE id=?")
          .run(JSON.stringify(next), id);
        return next;
      })
      .immediate();
  }
  pending() {
    return this.database
      .prepare(
        "SELECT body FROM source_previews WHERE status='pending' ORDER BY created_at DESC",
      )
      .pluck()
      .all()
      .map((body) => previewSchema.parse(JSON.parse(String(body))));
  }
  discard(id: string) {
    const preview = this.preview(id);
    if (preview.status !== "pending") return;
    this.database
      .prepare(
        "UPDATE source_previews SET status='discarded', body=? WHERE id=?",
      )
      .run(JSON.stringify({ ...preview, status: "discarded" }), id);
  }
  apply(id: string, documents: SourceDocument[], revision: number) {
    return this.database
      .transaction(() => {
        const preview = this.preview(id);
        if (preview.status === "applied")
          return { revision: preview.appliedRevision! };
        if (preview.status !== "pending")
          throw new Error("Предложение уже отклонено.");
        const current = this.snapshot();
        if (current.revision !== revision || preview.revision !== revision)
          throw new RevisionConflict(
            "Материалы изменились. Подготовьте обновление заново.",
          );
        const source: AcceptedSource = acceptedSourceSchema.parse({
          ...preview.source,
          revision: preview.source.revision + 1,
          documents,
        });
        const now = new Date().toISOString();
        this.database
          .prepare(
            "INSERT INTO sources VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,root_id=excluded.root_id,revision=excluded.revision,include_interviews=excluded.include_interviews,applied_at=excluded.applied_at",
          )
          .run(
            source.id,
            source.name,
            source.kind,
            source.rootId,
            source.revision,
            Number(source.includeInterviews),
            now,
          );
        this.database
          .prepare("DELETE FROM source_documents WHERE source_id=?")
          .run(source.id);
        const insert = this.database.prepare(
          "INSERT INTO source_documents VALUES (?,?,?,?)",
        );
        for (const document of source.documents)
          insert.run(
            document.id,
            source.id,
            document.path,
            JSON.stringify(document),
          );
        this.database
          .prepare("INSERT INTO source_versions VALUES (?,?,?,?)")
          .run(source.id, source.revision, JSON.stringify(source), now);
        const next = current.revision + 1;
        this.database
          .prepare(
            "UPDATE instance_meta SET value=? WHERE key='content_revision'",
          )
          .run(String(next));
        this.database
          .prepare(
            "UPDATE source_previews SET status='applied', body=? WHERE id=?",
          )
          .run(
            JSON.stringify({
              ...preview,
              status: "applied",
              appliedRevision: next,
            }),
            id,
          );
        return { revision: next };
      })
      .immediate();
  }
  roots() {
    return z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          path: z.string(),
          kind: z.literal("folder"),
        }),
      )
      .parse(
        this.database.prepare("SELECT * FROM source_roots ORDER BY name").all(),
      );
  }
  allowRoot(id: string, name: string, path: string) {
    this.database
      .prepare(
        "INSERT INTO source_roots VALUES (?,?,?,'folder') ON CONFLICT(id) DO UPDATE SET name=excluded.name,path=excluded.path",
      )
      .run(id, name, path);
  }
}
