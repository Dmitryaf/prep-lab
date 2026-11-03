import type { Progress } from "./state.ts";
import { validateState } from "./saved-state.ts";

export function mergeLegacyState(
  current: Progress,
  incoming: unknown,
): Progress {
  const legacy = validateState(incoming);
  return validateState({
    version: 3,
    progress: { ...legacy.progress, ...current.progress },
    questionProgress: {
      ...legacy.questionProgress,
      ...current.questionProgress,
    },
    daily: { ...legacy.daily, ...current.daily },
    sessions: { ...legacy.sessions, ...current.sessions },
    activeSession: current.activeSession || legacy.activeSession,
  });
}
