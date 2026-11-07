import { after } from "next/server";
import { z } from "zod";
import { streamDiscovery, tokensOf, updateMemory } from "@/ai/generate";
import { getModel } from "@/ai/provider";
import { AiError, aiSession, assertCanUseAi, recordUsage, threadTurns } from "@/ai/server";

export const maxDuration = 60;

const Body = z.object({
  brandId: z.uuid(),
  threadId: z.uuid().nullable(),
  message: z.string().trim().min(1).max(8000),
});

/** Refresh the project memory after every few designer messages. */
const MEMORY_EVERY = 3;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "Invalid request" }, { status: 400 });
  const { brandId, message } = parsed.data;

  try {
    const s = await aiSession(brandId);
    assertCanUseAi(s.allowance);

    let threadId = parsed.data.threadId;
    if (!threadId) {
      const { data, error } = await s.supabase
        .from("ai_threads")
        .insert({ brand_id: brandId, kind: "discovery", title: message.slice(0, 80), created_by: s.user.id })
        .select("id")
        .single();
      if (error) throw new AiError(error.code === "42501" ? "You can view this brand but not edit it." : error.message, 403);
      threadId = data.id as string;
    }

    const { error: msgErr } = await s.supabase.from("ai_messages").insert({ thread_id: threadId, brand_id: brandId, role: "user", content: message });
    if (msgErr) throw new AiError(msgErr.code === "42501" ? "You can view this brand but not edit it." : msgErr.message, 403);

    const turns = await threadTurns(s.supabase, threadId);
    const model = getModel();
    const result = streamDiscovery(model, s.context, turns, () => {});
    const id = threadId;

    // Saved after the reply finishes streaming, so a slow client never loses the answer.
    after(async () => {
      try {
        const text = (await result.text).trim();
        const tokens = tokensOf(await result.totalUsage);
        if (text) await s.supabase.from("ai_messages").insert({ thread_id: id, brand_id: brandId, role: "assistant", content: text.slice(0, 20000) });
        await recordUsage(s.supabase, s.brand.workspace_id, tokens);

        const count = s.memory.message_count + 1;
        let summary = s.memory.summary;
        if (count % MEMORY_EVERY === 0 || !summary) {
          const mem = await updateMemory(model, summary, [...turns, { role: "assistant", content: text }]);
          summary = mem.summary;
          await recordUsage(s.supabase, s.brand.workspace_id, mem.tokens);
        }
        await s.supabase.from("ai_memory").upsert({ brand_id: brandId, summary, message_count: count, updated_at: new Date().toISOString() });
      } catch (e) {
        console.error("assistant follow-up failed", e);
      }
    });

    return result.toTextStreamResponse({ headers: { "X-Thread-Id": threadId, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AiError) return Response.json({ message: e.message }, { status: e.status });
    console.error("assistant chat failed", e);
    return Response.json({ message: "The assistant couldn't reply. Try again." }, { status: 500 });
  }
}
