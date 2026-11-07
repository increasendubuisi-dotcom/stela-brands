"use server";

import { z } from "zod";
import { generateProposal, improveText as improveWithModel } from "@/ai/generate";
import type { ImproveMode } from "@/ai/prompts";
import type { Proposal } from "@/ai/proposal";
import { aiConfigured, aiModelName, getModel } from "@/ai/provider";
import { AiError, aiSession, assertCanUseAi, recordUsage, threadTurns, type Allowance } from "@/ai/server";

export type AiResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type AssistantState = {
  configured: boolean;
  model: string;
  allowance: Allowance;
  memory: string;
  threads: Array<{ id: string; title: string | null; updatedAt: string }>;
  threadId: string | null;
  messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
};

async function run<T>(fn: () => Promise<T>): Promise<AiResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AiError) return { ok: false, message: e.message };
    console.error("assistant action failed", e);
    return { ok: false, message: "The assistant couldn't finish that. Try again." };
  }
}

const Uuid = z.uuid();

export async function getAssistantState(brandId: string, threadId: string | null): Promise<AiResult<AssistantState>> {
  return run(async () => {
    const s = await aiSession(brandId);
    const { data: threads } = await s.supabase
      .from("ai_threads")
      .select("id, title, updated_at")
      .eq("brand_id", brandId)
      .order("updated_at", { ascending: false })
      .limit(20);
    const list = (threads ?? []).map((t) => ({ id: t.id as string, title: t.title as string | null, updatedAt: t.updated_at as string }));
    const chosen = threadId && Uuid.safeParse(threadId).success && list.some((t) => t.id === threadId) ? threadId : (list[0]?.id ?? null);
    let messages: AssistantState["messages"] = [];
    if (chosen) {
      const { data } = await s.supabase
        .from("ai_messages")
        .select("id, role, content")
        .eq("thread_id", chosen)
        .order("created_at", { ascending: true })
        .limit(200);
      messages = (data ?? []) as AssistantState["messages"];
    }
    return {
      configured: aiConfigured(),
      model: aiModelName(),
      allowance: s.allowance,
      memory: s.memory.summary,
      threads: list,
      threadId: chosen,
      messages,
    };
  });
}

/** Ask for suggestions from a conversation. Nothing is written to the guide here. */
export async function proposeFromThread(brandId: string, threadId: string | null): Promise<AiResult<{ id: string; proposal: Proposal }>> {
  return run(async () => {
    const s = await aiSession(brandId);
    assertCanUseAi(s.allowance);
    const turns = threadId && Uuid.safeParse(threadId).success ? await threadTurns(s.supabase, threadId) : [];
    const { proposal, tokens } = await generateProposal(getModel(), s.context, turns);
    await recordUsage(s.supabase, s.brand.workspace_id, tokens);
    const { data, error } = await s.supabase
      .from("ai_proposals")
      .insert({ brand_id: brandId, thread_id: threadId, output: proposal, created_by: s.user.id })
      .select("id")
      .single();
    if (error) throw new AiError(error.code === "42501" ? "You can view this brand but not edit it." : error.message, 403);
    return { id: data.id as string, proposal };
  });
}

/** Records what the designer decided, for history. The edits themselves go through autosave. */
export async function markProposal(brandId: string, proposalId: string, status: "applied" | "dismissed", appliedCount: number): Promise<AiResult<null>> {
  return run(async () => {
    if (!Uuid.safeParse(proposalId).success) throw new AiError("Unknown suggestion", 404);
    const s = await aiSession(brandId);
    await s.supabase
      .from("ai_proposals")
      .update({ status, applied_count: Math.max(0, Math.min(appliedCount, 100)), decided_at: new Date().toISOString() })
      .eq("id", proposalId)
      .eq("brand_id", brandId);
    return null;
  });
}

const Modes = z.enum(["improve", "shorter", "warmer", "bolder"]);

export async function improveText(brandId: string, text: string, mode: ImproveMode): Promise<AiResult<{ text: string }>> {
  return run(async () => {
    const cleaned = text.trim();
    if (!cleaned) throw new AiError("There's no text to improve yet.", 400);
    if (cleaned.length > 6000) throw new AiError("That text is too long to rewrite in one go (6,000 characters).", 400);
    const s = await aiSession(brandId);
    assertCanUseAi(s.allowance);
    const r = await improveWithModel(getModel(), s.context, cleaned, Modes.parse(mode));
    await recordUsage(s.supabase, s.brand.workspace_id, r.tokens);
    if (!r.text) throw new AiError("The assistant returned nothing. Try again.", 502);
    return { text: r.text };
  });
}

export async function clearMemory(brandId: string): Promise<AiResult<null>> {
  return run(async () => {
    const s = await aiSession(brandId);
    const { error } = await s.supabase.from("ai_memory").upsert({ brand_id: brandId, summary: "", message_count: 0, updated_at: new Date().toISOString() });
    if (error) throw new AiError(error.message, 403);
    return null;
  });
}
