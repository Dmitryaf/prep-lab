import { knowledgeSchema } from "../../../../domain/knowledge/contracts.ts";
import type { Knowledge } from "../../../../domain/knowledge/material.ts";

export async function getKnowledge(): Promise<Knowledge> {
  const response = await fetch("/api/knowledge");
  if (!response.ok) throw new Error("База знаний недоступна.");
  return knowledgeSchema.parse(await response.json());
}
