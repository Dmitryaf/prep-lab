import { randomUUID } from "node:crypto";
import {
  documentInputSchema,
  type SourceDocumentInput,
} from "../../domain/source/contracts.ts";
import {
  acceptSourceSchema,
  type AcceptSource,
  type SourcePreview,
  type AcceptedSource,
} from "../../domain/source/preview.ts";
import { planSourceUpdate } from "../../domain/source/update.ts";
import { resolveSourcePlan } from "../../domain/source/resolve.ts";
import { compileSourceDocument } from "../../domain/source/compile.ts";
import {
  sourceKnowledge,
  validateSourceLinks,
} from "../../domain/source/knowledge.ts";
import { sourceMetadata } from "../../domain/source/metadata.ts";
import type { Knowledge } from "../../domain/knowledge/material.ts";
import { SourceRepository } from "../infrastructure/storage/sources.ts";
import { RevisionConflict } from "../infrastructure/storage/preparation.ts";

export class SourceService {
  readonly repository: SourceRepository;
  private readonly base: () => Promise<Knowledge>;
  constructor(repository: SourceRepository, base: () => Promise<Knowledge>) {
    this.repository = repository;
    this.base = base;
  }
  knowledge(base: Knowledge) {
    return sourceKnowledge(base, this.repository.snapshot().sources);
  }
  preview(input: {
    sourceId?: string;
    name: string;
    kind: "upload" | "folder";
    rootId?: string | null;
    includeInterviews?: boolean;
    documents: SourceDocumentInput[];
    matches?: Record<string, string>;
  }) {
    const snapshot = this.repository.snapshot();
    const old = snapshot.sources.find((source) => source.id === input.sourceId);
    if (input.sourceId && !old) throw new Error("Источник не найден.");
    if (input.documents.length === 0)
      throw new Error(
        "Нет разрешённых Markdown-файлов. Пустой снимок не удаляет источник.",
      );
    const source = {
      id: old?.id || `source-${randomUUID()}`,
      name: input.name,
      kind: input.kind,
      rootId: input.rootId ?? old?.rootId ?? null,
      includeInterviews:
        input.includeInterviews ?? old?.includeInterviews ?? true,
      revision: old?.revision || 0,
    };
    const documents = input.documents.map((document) => {
      const metadata = sourceMetadata(document.markdown, document.path);
      return documentInputSchema.parse({
        ...document,
        kind: metadata.kind || document.kind,
        profile: metadata.profile || document.profile,
      });
    });
    return this.repository.savePreview({
      id: randomUUID(),
      source,
      revision: snapshot.revision,
      entries: planSourceUpdate(
        source.id,
        old?.documents || [],
        documents,
        randomUUID,
        input.matches,
      ),
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }
  async edit(
    sourceId: string,
    documentId: string,
    markdown: string,
    revision: number,
  ) {
    const snapshot = this.repository.snapshot();
    if (snapshot.revision !== revision)
      throw new RevisionConflict(
        "Материалы изменились. Откройте текущую версию.",
      );
    const source = snapshot.sources.find((source) => source.id === sourceId);
    const document = source?.documents.find(
      (document) => document.id === documentId,
    );
    if (!source || !document) throw new Error("Материал не найден.");
    const entries = source.documents.map((item) => {
      const { sourceMarkdown, markdown: current, ...identity } = item;
      return {
        ...identity,
        baseline: sourceMarkdown,
        current,
        incoming: sourceMarkdown,
        proposed: item.id === documentId ? markdown : current,
        status:
          item.id === documentId
            ? ("updated" as const)
            : ("unchanged" as const),
      };
    });
    // Persist the proposal through the same validation and acceptance boundary.
    const { documents: _documents, ...info } = source;
    return this.repository.savePreview({
      id: randomUUID(),
      source: info,
      revision,
      entries,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  }
  async accept(id: string, input: AcceptSource) {
    const options = acceptSourceSchema.parse(input),
      preview = this.repository.preview(id);
    if (preview.status === "applied")
      return { revision: preview.appliedRevision! };
    const snapshot = this.repository.snapshot();
    if (
      snapshot.revision !== options.revision ||
      preview.revision !== options.revision
    )
      throw new RevisionConflict(
        "Материалы изменились. Подготовьте обновление заново.",
      );
    const old = snapshot.sources.find(
      (source) => source.id === preview.source.id,
    );
    const documents = resolveSourcePlan(
      preview.entries,
      options.resolutions,
    ).map(
      (document) =>
        compileSourceDocument(
          document,
          old?.documents.find((item) => item.id === document.id),
          randomUUID,
          options.headingMatches[document.id],
        ).document,
    );
    if (
      Object.keys(options.headingMatches).some(
        (id) => !documents.some((document) => document.id === id),
      )
    )
      throw new Error("Неизвестное соответствие раздела.");
    const candidate: AcceptedSource = { ...preview.source, documents };
    const base = await this.base();
    const knowledge = sourceKnowledge(base, [
      ...snapshot.sources.filter((source) => source.id !== candidate.id),
      candidate,
    ]);
    const errors = validateSourceLinks(knowledge);
    if (errors.length)
      throw new Error("Проверьте ссылки: " + errors.join("; "));
    return this.repository.apply(id, documents, options.revision);
  }
  async inspect(preview: SourcePreview, input: AcceptSource) {
    const snapshot = this.repository.snapshot();
    const options = acceptSourceSchema.parse(input);
    const old = snapshot.sources.find(
      (source) => source.id === preview.source.id,
    );
    const compiled = resolveSourcePlan(
      preview.entries,
      options.resolutions,
    ).map((document) =>
      compileSourceDocument(
        document,
        old?.documents.find((item) => item.id === document.id),
        randomUUID,
        options.headingMatches[document.id],
      ),
    );
    const knowledge = sourceKnowledge(await this.base(), [
      ...snapshot.sources.filter((source) => source.id !== preview.source.id),
      { ...preview.source, documents: compiled.map((item) => item.document) },
    ]);
    return {
      notes: compiled.filter((item) => item.note).length,
      questions: compiled.flatMap((item) => item.questions).length,
      warnings: compiled.flatMap((item) => item.warnings),
      errors: validateSourceLinks(knowledge),
    };
  }
}
