export const interviewPositions = new Map<
  string,
  { left: number; top: number }
>();

export function rememberInterviewPosition(path: string) {
  interviewPositions.set(path, { left: window.scrollX, top: window.scrollY });
  if (interviewPositions.size > 30)
    interviewPositions.delete(interviewPositions.keys().next().value!);
}
