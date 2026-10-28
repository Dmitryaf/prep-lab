export type Rating = "done" | "partial" | "again";
export interface Mark {
  status: Rating;
  updatedAt?: string;
}
export interface StudyLink {
  kind: "theory" | "practice";
  noteId: string;
  heading: string;
  label: string;
}
export interface Question {
  id: string;
  title: string;
  prompt: string;
  answer: string;
  kind: string;
  source: string;
  category: string;
  availableAnswer?: boolean;
  shortAnswer?: string;
  criteria?: string;
  details?: string;
  noteId?: string;
  heading?: string;
  topicId?: string;
  project?: string;
  parentId?: string;
  curriculumTier?: "core" | "extended" | "vacancy";
  followups?: string[];
  followupAnswers?: { title: string; answer: string }[];
  learningLinks?: StudyLink[];
}
export interface Interview {
  id: string;
  kind: "daily" | "full";
  date: string;
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
}
export interface Note {
  id: string;
  path: string;
  title: string;
  markdown: string;
  category: string;
}
export interface Knowledge {
  notes: Note[];
  questions: Question[];
  route: string[];
  warnings: string[];
}
export interface CodeStep {
  project: string;
  path: string;
  line: number;
  symbol: string;
  title: string;
  explanation: string;
}
export interface Pilot {
  id: string;
  sourceRevision?: string;
  title: string;
  explanation: {
    intro: string;
    steps: { title: string; text: string }[];
    details?: string;
  };
  study: { path: string; label: string; why: string }[];
  questions: {
    id: string;
    question: string;
    short: string;
    detailed: string[];
    example: string;
  }[];
  code: {
    intro: string;
    steps: CodeStep[];
    tests: CodeStep[];
    limitations?: string;
  };
}
export interface Topic {
  id: string;
  project: string;
  title: string;
  group: string;
  priority: string;
  minutes: number;
  summary: string;
  related: string[];
  pilot: Pilot;
  story?: {
    short: string;
    deep: string[];
    confirmed: string;
    assumptions: string;
    reconstruction: string;
    boundaries: string;
  };
}
export interface RoutePath {
  id: string;
  name: string;
  caption: string;
  nodes: string[];
}
export interface Project {
  id: string;
  name: string;
  subtitle: string;
  pitch: string;
  icon: string;
  routes: RoutePath[];
}
