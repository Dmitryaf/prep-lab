import type { PreparedQuestion } from "./question.ts";
export interface Note {
  id: string;
  path: string;
  title: string;
  markdown: string;
  category: string;
  sourceId?: string;
  aliases?: string[];
  headingAliases?: Record<string, string>;
  profiles?: ("vue" | "react")[];
}
export interface Knowledge {
  notes: Note[];
  questions: PreparedQuestion[];
  route: string[];
  warnings: string[];
  profiles?: Partial<Record<"vue" | "react", string[]>>;
}
