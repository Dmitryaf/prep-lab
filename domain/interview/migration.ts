import type { Progress } from "./state.ts";
import { validateState } from "./saved-state.ts";

export function mergeLegacyState(
  current: Progress,
  incoming: unknown,
): Progress {
  const legacy = validateState(incoming);
  return validateState({
    version: 3,
    ...(legacy.practiceAttempts || current.practiceAttempts
      ? {
          practiceAttempts: {
            ...legacy.practiceAttempts,
            ...current.practiceAttempts,
          },
        }
      : {}),
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
