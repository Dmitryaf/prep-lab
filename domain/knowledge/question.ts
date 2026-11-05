export interface StudyLink {
  kind: "theory" | "practice";
  noteId: string;
  heading: string;
  label: string;
  profiles?: ("vue" | "react")[];
}
export interface Question {
  interviewEligible?: boolean;
  roundFormat?: "coding" | "review" | "design";
  codingRole?: "short" | "main" | "advanced";
  profiles?: ("vue" | "react")[];
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
  projectGroup?: string;
  parentId?: string;
  curriculumTier?: "core" | "extended" | "vacancy";
  followups?: string[];
  followupAnswers?: {
    title: string;
    answer: string;
    prompt?: string;
    criteria?: string;
  }[];
  learningLinks?: StudyLink[];
}
export type PreparedQuestion = Question & {
  followups: string[];
  learningLinks: StudyLink[];
  criteria: string;
};
