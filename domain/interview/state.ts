import type { Question } from "../knowledge/question.ts";
import type { Rating, Mark } from "./rating.ts";
export interface AnswerAttempt {
  text: string;
  solutionUrl: string;
  updatedAt: string;
}
export interface Interview {
  id: string;
  kind: "daily" | "full";
  date: string;
  profile?: "vue" | "react";
  format?: "mixed" | "coding" | "review" | "design";
  attempts?: Record<string, AnswerAttempt>;
  questionIds: string[];
  index: number;
  finished: boolean;
  snapshots: Record<string, Question>;
  ratings: Record<string, Rating>;
  skipped: string[];
  reviewed?: string[];
  followupIndex?: number;
  followupChoices?: Record<string, number[]>;
}
export interface Progress {
  version: 3;
  progress: Record<string, Mark>;
  questionProgress: Record<string, Mark>;
  sessions: Record<string, Interview>;
  daily: Record<string, Interview>;
  activeSession: string | null;
  practiceAttempts?: Record<string, AnswerAttempt>;
}
