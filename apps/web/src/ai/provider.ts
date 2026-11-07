/**
 * The AI provider sits behind this one module so it can be swapped (another
 * provider, a gateway) without touching features. Server only: the API key is
 * read from the environment and never reaches the browser.
 */
import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export const DEFAULT_MODEL = "gpt-6-luna";

export function aiConfigured(): boolean {
  const provider = process.env.AI_PROVIDER || "openai";
  return provider === "openai" && Boolean(process.env.OPENAI_API_KEY);
}

export function aiModelName(): string {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}

export function getModel(): LanguageModel {
  if (!aiConfigured()) throw new Error("AI is not configured");
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai(aiModelName());
}
