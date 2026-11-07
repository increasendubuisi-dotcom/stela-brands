import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { addBlock, addSection, docToText, sectionBlocks, setStrategy, type Draft } from "../editor/model";
import { buildBrandContext, MAX_CONTEXT_CHARS } from "./context";
import { generateProposal, improveText, streamDiscovery, trimHistory, updateMemory } from "./generate";
import { applyItems, defaultSelection, proposalToItems, type Proposal } from "./proposal";

const ids = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`;
};
const empty = (): Draft => ({ sections: {}, blocks: {}, strategy: {}, colors: {}, families: {}, styles: {}, assets: {}, fontFiles: {} });

function build() {
  const newId = ids();
  let d = empty();
  const story = addSection(d, null, "Brand story", newId);
  d = story.draft;
  const logo = addSection(d, null, "Logo", newId);
  d = logo.draft;
  d = setStrategy(d, "mission", "Feed people well.").draft;
  return { d, newId, story: story.created!, logo: logo.created! };
}

const usage = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 50, text: 50, reasoning: 0 } };
const textModel = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage,
      warnings: [],
    }),
  });

describe("brand context", () => {
  it("lists strategy, sections with ids, and memory", () => {
    const { d, story } = build();
    const ctx = buildBrandContext({ name: "Mama's Pot", description: "Jollof for office workers", website: null }, d, "- Lunch delivery in Lagos");
    expect(ctx).toContain("# Brand: Mama's Pot");
    expect(ctx).toContain("- mission: Feed people well.");
    expect(ctx).toContain("- vision: (empty)");
    expect(ctx).toContain(`[${story}] Brand story`);
    expect(ctx).toContain("Lunch delivery in Lagos");
  });

  it("is capped in length", () => {
    const { d } = build();
    const ctx = buildBrandContext({ name: "X", description: "word ".repeat(10_000), website: null }, d, "m ".repeat(20_000));
    expect(ctx.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
  });
});

describe("history trimming", () => {
  it("keeps recent turns and starts on a user turn", () => {
    const turns = [
      { role: "user" as const, content: "a".repeat(100) },
      { role: "assistant" as const, content: "b".repeat(100) },
      { role: "user" as const, content: "c" },
    ];
    expect(trimHistory(turns, 150).map((t) => t.content)).toEqual(["c"]);
    expect(trimHistory(turns, 1000)).toHaveLength(3);
  });
});

describe("proposals", () => {
  const proposal = (d: Draft, story: string): Proposal => ({
    summary: "Fills mission and vision, adds story text.",
    strategy: [
      { key: "mission", value: "Feed busy Lagos workers a proper lunch.", why: "You said lunch is the core." },
      { key: "vision", value: "Every office in Lagos eats better.", why: "Stated ambition." },
      { key: "vision", value: "Duplicate", why: "dup" },
      { key: "purpose", value: "  ", why: "x" },
    ].filter((s) => s.value.trim()) as Proposal["strategy"],
    sectionText: [
      { sectionId: story, text: "It started in a small kitchen.\n\nNow it feeds hundreds.", why: "From the founder story." },
      { sectionId: "not-a-section", text: "Lost", why: "x" },
    ],
  });

  it("drops duplicates and unknown sections, and leaves replacements unticked", () => {
    const { d, story } = build();
    const items = proposalToItems(proposal(d, story), d);
    expect(items.map((i) => i.id)).toEqual(["strategy:mission", "strategy:vision", `section:${story}:0`]);
    const mission = items[0]!;
    expect(mission.current).toBe("Feed people well.");
    const chosen = defaultSelection(items);
    expect(chosen.has("strategy:mission")).toBe(false);
    expect(chosen.has("strategy:vision")).toBe(true);
  });

  it("applies only chosen items, marks strategy as AI, and appends text without overwriting", () => {
    const { d: base, story, newId } = build();
    const d = addBlock(base, story, "text", null, {}, newId).draft;
    const items = proposalToItems(proposal(d, story), d);
    const result = applyItems(d, items, defaultSelection(items), newId);
    expect(result.applied).toBe(2);
    expect(result.draft.strategy.mission?.value).toBe("Feed people well.");
    expect(result.draft.strategy.vision).toMatchObject({ value: "Every office in Lagos eats better.", source: "ai", status: "approved" });
    const before = sectionBlocks(d, story);
    const blocks = sectionBlocks(result.draft, story);
    expect(blocks).toHaveLength(before.length + 1);
    expect(blocks.slice(0, -1)).toEqual(before);
    expect(docToText(blocks.at(-1)!.props.doc)).toBe("It started in a small kitchen.\n\nNow it feeds hundreds.");
    expect(result.ops.some((o) => o.op === "delete")).toBe(false);
  });
});

describe("model calls (mock provider)", () => {
  it("generates a structured proposal and reports tokens", async () => {
    const { d, story } = build();
    const json = JSON.stringify({
      summary: "Adds a vision.",
      strategy: [{ key: "vision", value: "Every office eats better.", why: "Stated." }],
      sectionText: [{ sectionId: story, text: "Hello.", why: "Story." }],
    });
    const model = textModel(json);
    const { proposal, tokens } = await generateProposal(model, buildBrandContext({ name: "X", description: null, website: null }, d, null), [
      { role: "user", content: "We want every office to eat better." },
    ]);
    expect(proposal.strategy[0]?.key).toBe("vision");
    expect(tokens).toBe(150);
    const call = model.doGenerateCalls[0]!;
    expect(JSON.stringify(call.prompt)).toContain("every office to eat better");
    expect(call.responseFormat?.type).toBe("json");
  });

  it("rejects a proposal that does not match the schema", async () => {
    const model = textModel(JSON.stringify({ summary: "x", strategy: [{ key: "slogan", value: "y", why: "z" }], sectionText: [] }));
    await expect(generateProposal(model, "ctx", [])).rejects.toThrow();
  });

  it("improves text and updates memory", async () => {
    expect((await improveText(textModel("  Tighter.  "), "ctx", "Loose text", "improve")).text).toBe("Tighter.");
    const mem = await updateMemory(textModel("- Sells jollof"), "", [{ role: "user", content: "We sell jollof" }]);
    expect(mem).toEqual({ summary: "- Sells jollof", tokens: 150 });
  });

  it("streams a discovery reply and hands the full text to onDone", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Who buys " },
            { type: "text-delta", id: "t", delta: "from you?" },
            { type: "text-end", id: "t" },
            { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
          ],
        }),
      }),
    });
    let done: { text: string; tokens: number } | null = null;
    const result = streamDiscovery(model, "ctx", [{ role: "user", content: "Hi" }], (text, tokens) => {
      done = { text, tokens };
    });
    const res = result.toTextStreamResponse();
    expect(await res.text()).toBe("Who buys from you?");
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toEqual({ text: "Who buys from you?", tokens: 150 });
  });
});
