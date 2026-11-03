export type Rating = "done" | "partial" | "again";
export interface Mark {
  status: Rating;
  updatedAt?: string;
}
