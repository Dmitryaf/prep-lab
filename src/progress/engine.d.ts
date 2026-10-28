import type {
  Progress,
  Question,
  Interview,
  Rating,
  Mark,
} from "../shared/types";
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const storageKey: string;
export function loadState(storage?: StoragePort): Progress;
export function saveState(state: Progress, storage?: StoragePort): Progress;
export function exportState(state: Progress): string;
export function importState(text: string, current: Progress): Progress;
export function rateQuestion(
  state: Progress,
  id: string,
  status: Rating,
): Progress;
export function localDate(date?: Date): string;
export function availableFollowups(session: Interview): number[];
export function openFollowup(session: Interview): Interview;
export function advanceQuestion(session: Interview, skip?: boolean): Interview;
export function selectInterview(
  questions: Question[],
  kind: "daily" | "full",
  date: string,
  history?: Interview[],
  progress?: Record<string, Mark>,
): Question[];
export function createSession(
  questions: Question[],
  kind?: "daily" | "full",
  progress?: Record<string, Mark>,
): Interview;
export function dailySession(
  state: Progress,
  questions: Question[],
  date?: string,
): Progress;
