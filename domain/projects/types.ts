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
    criteria?: string;
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
  context?: string;
  mechanism: string[];
  decision?: string;
  tradeoff: string;
  question: string;
  answer: string;
  failures?: string[];
  interview?: string[];
  sources: [string, string][];
  theory: [string, string][];
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
  repo: string;
  branch: string;
  color: string;
  stack: string[];
  routes: RoutePath[];
}
export type TopicSeed = Omit<Topic, "pilot">;
export type SourceReference = Pick<
  CodeStep,
  "project" | "path" | "line" | "symbol"
>;
