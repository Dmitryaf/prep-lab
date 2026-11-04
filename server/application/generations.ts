import { randomUUID } from "node:crypto";
import { z } from "zod";
import { composePrompt } from "../../domain/prompts/compose.ts";
import {
  promptInputSchema,
  importDraftSchema,
  type PromptInput,
  type PromptTemplate,
} from "../../domain/prompts/contracts.ts";
import { projectDraftSchema } from "../../domain/projects/draft.ts";
import { validateProjectEvidence } from "../../domain/projects/from-draft.ts";
import type {
  Generation,
  GenerationEvent,
} from "../../domain/generation/contracts.ts";
import type { Answer } from "../types.ts";
import { GenerationRepository } from "../infrastructure/storage/generations.ts";
import { PromptRepository } from "../infrastructure/storage/prompts.ts";
import { ProjectRepository } from "../infrastructure/storage/reviewed-projects.ts";
import { RevisionConflict } from "../infrastructure/storage/preparation.ts";
import type { SourceService } from "./sources.ts";
interface Options {
  repository: GenerationRepository;
  projects: ProjectRepository;
  prompts: PromptRepository;
  templates: () => Promise<PromptTemplate[]>;
  sources: SourceService;
  answer: Answer;
}
export class GenerationService {
  readonly repository: GenerationRepository;
  private readonly options: Options;
  private readonly active = new Map<
    string,
    { controller: AbortController; done: Promise<void> }
  >();
  constructor(options: Options) {
    this.options = options;
    this.repository = options.repository;
    this.repository.recoverInterrupted();
  }
  async prompt(scenario: "import" | "project", input: PromptInput) {
    const template = (await this.options.templates()).find(
      (template) => template.id === scenario,
    );
    if (!template) throw new Error("Шаблон не найден.");
    return composePrompt(
      template,
      this.options.prompts.read(template).text,
      input,
    );
  }
  async run(
    scenario: "import" | "project",
    raw: PromptInput,
    emit: (event: GenerationEvent) => void,
    signal?: AbortSignal,
    expectedPrompt?: string,
  ) {
    if (this.active.size)
      throw new RevisionConflict(
        "Уже выполняется подготовка. Дождитесь результата или остановите запрос.",
      );
    const input = promptInputSchema.parse(raw),
      prompt = await this.prompt(scenario, input);
    if (expectedPrompt !== undefined && expectedPrompt !== prompt)
      throw new RevisionConflict(
        "Промпт изменился. Снова просмотрите задание перед отправкой.",
      );
    if (this.active.size)
      throw new RevisionConflict("Уже выполняется подготовка.");
    const id = randomUUID(),
      controller = new AbortController();
    let finish: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.active.set(id, { controller, done });
    const stop = () => controller.abort();
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) controller.abort();
    const job: Generation = {
      id,
      scenario,
      status: "pending",
      createdAt: new Date().toISOString(),
      revision: this.options.projects.revision(),
      input,
      prompt,
      raw: "",
      draft: null,
      error: "",
    };
    try {
      this.repository.save(job);
      emit({ id });
      const text = await this.options.answer({
        context: JSON.stringify(input),
        trustedTask: prompt,
        messages: [{ role: "user", text: input.request, status: "completed" }],
        signal: controller.signal,
        onDelta: (delta) => {
          if (job.raw.length + delta.length > 250000) {
            controller.abort();
            throw new Error("Ответ слишком большой.");
          }
          job.raw += delta;
          this.repository.save(job);
          emit({ delta });
        },
      });
      if (controller.signal.aborted) throw new Error("Остановлено.");
      job.raw = z.string().max(250000).parse(text);
      const rawResult = JSON.parse(
        text.replace(/^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/, "$1"),
      );
      job.draft =
        scenario === "import"
          ? importDraftSchema.parse(rawResult)
          : validateProjectEvidence(projectDraftSchema.parse(rawResult), input);
      job.status = "completed";
      this.repository.save(job);
      emit({ done: true });
    } catch {
      job.status = controller.signal.aborted ? "interrupted" : "failed";
      job.draft = null;
      job.error = controller.signal.aborted
        ? "Запрос остановлен. Частичный ответ сохранён."
        : "Ответ не получен или не прошёл проверку. Принятые материалы не изменены.";
      this.repository.save(job);
      emit({ error: job.error });
    } finally {
      signal?.removeEventListener("abort", stop);
      this.active.delete(id);
      finish();
    }
    return job;
  }
  cancel(id: string) {
    this.active.get(id)?.controller.abort();
  }
  async close() {
    for (const { controller } of this.active.values()) controller.abort();
    await Promise.all([...this.active.values()].map((item) => item.done));
  }
  async accept(
    id: string,
    raw: unknown,
    revision: number,
  ): Promise<{ projectId?: string; previewId?: string }> {
    const job = this.repository.read(id);
    if (job.status === "accepted")
      return {
        ...(job.projectId ? { projectId: job.projectId } : {}),
        ...(job.previewId ? { previewId: job.previewId } : {}),
      };
    if (job.status !== "completed" || !job.draft)
      throw new Error("Незавершённый результат нельзя принять.");
    if (
      this.options.projects.revision() !== revision ||
      job.revision !== revision
    )
      throw new RevisionConflict(
        "Материалы изменились. Подготовьте разбор с текущей версией.",
      );
    if (job.scenario === "project")
      return this.options.projects.accept(
        job,
        validateProjectEvidence(projectDraftSchema.parse(raw), job.input),
        revision,
      );
    const result = importDraftSchema.parse(raw);
    return this.repository.acceptImport(id, revision, result, () =>
      this.options.sources.preview({
        name: "Материалы из ChatGPT",
        kind: "upload",
        documents: result.documents,
      }),
    );
  }
}
