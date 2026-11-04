import type { AnswerOptions, Answer } from "./types.ts";
import { assistantRuntime } from "./infrastructure/codex/runtime.ts";
import { assistantLogin } from "./infrastructure/codex/login.ts";
// All scenarios share the same runtime and process-wide turn gate.
export class Codex {
  private readonly runtime: Pick<typeof assistantRuntime, "answer">;
  private controller?: AbortController;
  constructor(
    runtime: Pick<typeof assistantRuntime, "answer"> = assistantRuntime,
  ) {
    this.runtime = runtime;
  }
  async answer(options: AnswerOptions) {
    const controller = new AbortController();
    this.controller = controller;
    try {
      return await this.runtime.answer({
        ...options,
        signal: AbortSignal.any([options.signal, controller.signal]),
      });
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }
  close() {
    this.controller?.abort();
  }
}
export const answerWithCodex: Answer = (options) =>
  assistantRuntime.answer(options);
export const closeCodex = () => {
  assistantRuntime.close();
  assistantLogin.cancel();
};
