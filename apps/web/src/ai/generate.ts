/**
 * Model calls. Every function takes the model as an argument so tests can pass
 * a mock; the route and actions pass the configured provider's model.
 */
import { generateText, Output, streamText, type LanguageModel, type ModelMessage } from "ai";
import { discoveryPrompt, improvePrompt, IMPROVE_MODES, memoryPrompt, proposalPrompt, type ImproveMode } from "./prompts";
import { ProposalSchema, type Proposal } from "./proposal";

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Keep the most recent turns that fit, always starting on a user turn. */
export function trimHistory(turns: ChatTurn[], maxChars = 16_000): ChatTurn[] {
  const out: ChatTurn[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (used + t.content.length > maxChars && out.length) break;
    out.unshift(t);
    used += t.content.length;
  }
  while (out.length && out[0]!.role !== "user") out.shift();
  return out;
}

export function tokensOf(usage: { totalTokens?: number; inputTokens?: number; outputTokens?: number } | undefined): number {
  if (!usage) return 0;
  return usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
}

export function streamDiscovery(
  model: LanguageModel,
  context: string,
  turns: ChatTurn[],
  onDone: (text: string, tokens: number) => Promise<void> | void,
) {
  return streamText({
    model,
    system: discoveryPrompt(context),
    messages: trimHistory(turns) as ModelMessage[],
    maxOutputTokens: 1200,
    onEnd: async (event) => {
      await onDone(event.text, tokensOf(event.totalUsage));
    },
  });
}

export async function generateProposal(model: LanguageModel, context: string, turns: ChatTurn[]): Promise<{ proposal: Proposal; tokens: number }> {
  const history = trimHistory(turns);
  const transcript = history.map((t) => `${t.role === "user" ? "Designer" : "Strategist"}: ${t.content}`).join("\n\n");
  const result = await generateText({
    model,
    system: proposalPrompt(context),
    prompt: `Conversation so far:\n\n${transcript || "(no conversation yet: use the brand context only)"}`,
    output: Output.object({ schema: ProposalSchema }),
    maxOutputTokens: 4000,
  });
  return { proposal: ProposalSchema.parse(result.output), tokens: tokensOf(result.totalUsage) };
}

export async function improveText(model: LanguageModel, context: string, text: string, mode: ImproveMode): Promise<{ text: string; tokens: number }> {
  const result = await generateText({
    model,
    system: improvePrompt(context, IMPROVE_MODES[mode]),
    prompt: text.slice(0, 6000),
    maxOutputTokens: 1500,
  });
  return { text: result.text.trim(), tokens: tokensOf(result.totalUsage) };
}

export async function updateMemory(model: LanguageModel, previous: string, turns: ChatTurn[]): Promise<{ summary: string; tokens: number }> {
  const recent = turns.slice(-6).map((t) => `${t.role === "user" ? "Designer" : "Strategist"}: ${t.content.slice(0, 2000)}`).join("\n\n");
  const result = await generateText({
    model,
    system: memoryPrompt(),
    prompt: `Previous memory:\n${previous || "(none)"}\n\nNew conversation turns:\n${recent}`,
    maxOutputTokens: 600,
  });
  return { summary: result.text.trim().slice(0, 8000), tokens: tokensOf(result.totalUsage) };
}
