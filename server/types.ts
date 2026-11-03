export type ChatStatus = "completed" | "pending" | "failed" | "interrupted";
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  status: ChatStatus;
}
export interface ChatHistory {
  key: string;
  messages: ChatMessage[];
}
export interface AnswerOptions {
  context: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  onDelta: (delta: string) => void;
}
export type Answer = (options: AnswerOptions) => Promise<string>;
export interface StudyChatOptions {
  directory?: string;
  answer?: Answer;
  history?: {
    read: (key: string) => ChatHistory;
    save: (value: ChatHistory) => void;
  };
}
