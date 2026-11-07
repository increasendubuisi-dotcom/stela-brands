"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  clearMemory,
  getAssistantState,
  improveText,
  markProposal,
  proposeFromThread,
  type AssistantState,
} from "@/app/(app)/brands/[id]/ai-actions";
import type { ImproveMode } from "@/ai/prompts";
import { applyItems, defaultSelection, proposalToItems, type ProposalItem } from "@/ai/proposal";
import { STRATEGY_LABELS } from "./canvas";
import type { Draft, Result } from "./model";

type Msg = { id: string; role: "user" | "assistant"; content: string };
type Review = { id: string; summary: string; items: ProposalItem[]; chosen: Set<string> };

const STARTERS = [
  "Here's what the business does and who it's for…",
  "Help me find this brand's positioning.",
  "Ask me questions to fill in the brand strategy.",
];

export function AssistantPanel({ brandId, draft, run, onClose }: {
  brandId: string;
  draft: Draft;
  run: (command: (d: Draft) => Result) => Result;
  onClose: () => void;
}) {
  const [state, setState] = useState<AssistantState | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  const load = (tid: string | null) =>
    start(async () => {
      const r = await getAssistantState(brandId, tid);
      if (!r.ok) return setError(r.message);
      setState(r.data);
      setThreadId(r.data.threadId);
      setMessages(r.data.messages);
    });

  useEffect(() => {
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, review]);

  const blockedReason = !state
    ? null
    : !state.configured
      ? "The assistant isn't switched on yet. An OpenAI API key needs to be added to the server settings (OPENAI_API_KEY)."
      : state.allowance.limit <= 0
        ? "Your plan doesn't include the AI assistant. The AI plan adds it."
        : state.allowance.used >= state.allowance.limit
          ? "You've used this month's AI allowance. It resets on the 1st."
          : null;

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || streaming || blockedReason) return;
    setError(null);
    setDone(null);
    setInput("");
    const userMsg: Msg = { id: `local-${Date.now()}`, role: "user", content: message };
    const replyId = `reply-${Date.now()}`;
    setMessages((m) => [...m, userMsg, { id: replyId, role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, threadId, message }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "The assistant couldn't reply. Try again.");
      }
      const newThread = res.headers.get("X-Thread-Id");
      if (newThread && newThread !== threadId) setThreadId(newThread);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        reply += decoder.decode(value, { stream: true });
        setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: reply } : x)));
      }
      if (!reply.trim()) throw new Error("The assistant returned nothing. Try again.");
      setState((s) => (s && newThread && !s.threads.some((t) => t.id === newThread) ? { ...s, threads: [{ id: newThread, title: message.slice(0, 80), updatedAt: new Date().toISOString() }, ...s.threads] } : s));
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== replyId || x.content));
      setError(e instanceof Error ? e.message : "The assistant couldn't reply.");
    } finally {
      setStreaming(false);
    }
  };

  const populate = () =>
    start(async () => {
      setError(null);
      setDone(null);
      const r = await proposeFromThread(brandId, threadId);
      if (!r.ok) return setError(r.message);
      const items = proposalToItems(r.data.proposal, draft);
      if (!items.length) {
        await markProposal(brandId, r.data.id, "dismissed", 0);
        return setDone("Nothing new to add yet. Tell the assistant more about the brand first.");
      }
      setReview({ id: r.data.id, summary: r.data.proposal.summary, items, chosen: defaultSelection(items) });
    });

  const apply = () => {
    if (!review) return;
    // Re-check against the latest draft, so edits made while reviewing are respected.
    const items = review.items.filter((i) => i.kind !== "section_text" || draft.sections[i.sectionId]);
    let applied = 0;
    run((d) => {
      const r = applyItems(d, items, review.chosen);
      applied = r.applied;
      return { draft: r.draft, ops: r.ops };
    });
    void markProposal(brandId, review.id, "applied", applied);
    setReview(null);
    setDone(`Added ${applied} suggestion${applied === 1 ? "" : "s"} to the guide. Undo by editing them like any other text.`);
  };

  const dismiss = () => {
    if (review) void markProposal(brandId, review.id, "dismissed", 0);
    setReview(null);
  };

  const toggle = (id: string) =>
    setReview((r) => {
      if (!r) return r;
      const chosen = new Set(r.chosen);
      if (chosen.has(id)) chosen.delete(id);
      else chosen.add(id);
      return { ...r, chosen };
    });

  return (
    <div className="flex h-full flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-base font-semibold">Brand assistant</h2>
        <button type="button" onClick={onClose} aria-label="Close the assistant" className="rounded-md px-2 py-1 text-muted hover:bg-paper hover:text-ink">
          ✕
        </button>
      </div>

      {state ? (
        <div className="flex items-center gap-2">
          <select
            aria-label="Conversation"
            value={threadId ?? ""}
            onChange={(e) => {
              setReview(null);
              if (e.target.value) load(e.target.value);
              else {
                setThreadId(null);
                setMessages([]);
              }
            }}
            className="h-9 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 text-[13px]"
          >
            <option value="">New conversation</option>
            {state.threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || "Untitled conversation"}
              </option>
            ))}
          </select>
          <UsageMeter used={state.allowance.used} limit={state.allowance.limit} />
        </div>
      ) : null}

      {blockedReason ? <p className="rounded-md bg-[#fbf0d9] p-3 text-[13px] text-[#6b4700]">{blockedReason}</p> : null}

      <div ref={listRef} className="flex min-h-[240px] flex-1 flex-col gap-3 overflow-auto rounded-md bg-paper p-3" aria-live="polite">
        {!state && pending ? <p className="text-muted">Loading…</p> : null}
        {state && !messages.length ? (
          <div className="flex flex-col gap-2 text-[13px] text-muted">
            <p>
              Talk through the brand here. The assistant reads this guide&apos;s strategy, sections, colours and type, and
              remembers what you agree across conversations. Nothing changes in the guide until you review and accept it.
            </p>
            {STARTERS.map((s) => (
              <button key={s} type="button" onClick={() => setInput(s)} disabled={Boolean(blockedReason)} className="rounded-md border border-line bg-surface px-3 py-2 text-left text-ink hover:border-accent disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "ml-6 self-end rounded-lg bg-ink px-3 py-2 text-white" : "mr-6 rounded-lg border border-line bg-surface px-3 py-2"}>
            <p className="whitespace-pre-wrap leading-relaxed">{m.content || (streaming ? "…" : "")}</p>
          </div>
        ))}
        {review ? <ReviewCard review={review} draft={draft} toggle={toggle} apply={apply} dismiss={dismiss} /> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-[#fbe9e5] p-2.5 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      {done ? <p className="rounded-md bg-[#e6f2ea] p-2.5 text-[13px] text-success">{done}</p> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={3}
          maxLength={8000}
          placeholder="Tell the assistant about the brand…"
          disabled={Boolean(blockedReason)}
          aria-label="Message the assistant"
          className="resize-none rounded-[var(--radius-control)] border border-line-strong p-2.5 outline-none focus:border-accent disabled:bg-paper"
        />
        <div className="flex gap-2">
          <button type="submit" disabled={!input.trim() || streaming || Boolean(blockedReason)} className="rounded-md bg-ink px-3 py-2 font-medium text-white disabled:opacity-40">
            {streaming ? "Replying…" : "Send"}
          </button>
          <button
            type="button"
            onClick={populate}
            disabled={pending || streaming || Boolean(blockedReason) || Boolean(review)}
            className="flex-1 rounded-md border border-accent px-3 py-2 font-medium text-accent hover:bg-paper disabled:opacity-40"
          >
            {pending && state ? "Thinking…" : "Populate the guide"}
          </button>
        </div>
      </form>

      {state?.memory ? (
        <details className="rounded-md border border-line p-2.5 text-[13px]">
          <summary className="cursor-pointer font-medium">What the assistant remembers</summary>
          <p className="mt-2 whitespace-pre-wrap text-muted">{state.memory}</p>
          <button
            type="button"
            onClick={() =>
              window.confirm("Clear what the assistant remembers about this brand? Conversations are kept.") &&
              start(async () => {
                const r = await clearMemory(brandId);
                if (!r.ok) setError(r.message);
                else setState((s) => (s ? { ...s, memory: "" } : s));
              })
            }
            className="mt-2 text-danger underline"
          >
            Clear memory
          </button>
        </details>
      ) : null}
      {state ? <p className="text-[11px] text-muted">Model: {state.model}</p> : null}
    </div>
  );
}

function UsageMeter({ used, limit }: { used: number; limit: number }) {
  if (limit <= 0) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  return (
    <span title={`${used.toLocaleString()} of ${limit.toLocaleString()} AI tokens used this month`} className="shrink-0 text-[11px] text-muted">
      {fmt(used)}/{fmt(limit)} · {pct}%
    </span>
  );
}

function ReviewCard({ review, draft, toggle, apply, dismiss }: {
  review: Review;
  draft: Draft;
  toggle: (id: string) => void;
  apply: () => void;
  dismiss: () => void;
}) {
  const count = review.items.filter((i) => review.chosen.has(i.id)).length;
  return (
    <div className="rounded-lg border-2 border-accent bg-surface p-3">
      <p className="text-xs uppercase tracking-[0.08em] text-muted">Suggestions to review</p>
      <p className="mt-1 text-[13px]">{review.summary}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {review.items.map((item) => {
          const label = item.kind === "strategy" ? STRATEGY_LABELS[item.key] : `New text in “${draft.sections[item.sectionId]?.title ?? item.sectionTitle}”`;
          return (
            <li key={item.id} className="rounded-md border border-line p-2.5">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={review.chosen.has(item.id)} onChange={() => toggle(item.id)} />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">
                    {label}
                    {item.current ? <span className="ml-1 rounded bg-[#fbf0d9] px-1.5 text-[11px] font-normal text-[#6b4700]">replaces existing</span> : null}
                  </span>
                  <span className="whitespace-pre-wrap text-[13px] leading-relaxed">{item.value}</span>
                  {item.current ? (
                    <span className="text-[12px] text-muted">
                      Now: <span className="line-through">{item.current.length > 220 ? `${item.current.slice(0, 220)}…` : item.current}</span>
                    </span>
                  ) : null}
                  <span className="text-[12px] italic text-muted">{item.why}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={apply} disabled={!count} className="rounded-md bg-accent px-3 py-2 font-medium text-white disabled:opacity-40">
          Add {count} to the guide
        </button>
        <button type="button" onClick={dismiss} className="rounded-md border border-line px-3 py-2 hover:bg-paper">
          Dismiss
        </button>
      </div>
    </div>
  );
}

/** Rewrite one piece of text. The designer sees the result and chooses whether to use it. */
export function ImproveTool({ brandId, text, onUse }: { brandId: string; text: string; onUse: (text: string) => void }) {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const modes: Array<[ImproveMode, string]> = [
    ["improve", "Improve"],
    ["shorter", "Shorter"],
    ["warmer", "Warmer"],
    ["bolder", "Bolder"],
  ];
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <span className="font-medium">Improve with AI</span>
      <div className="flex flex-wrap gap-1.5">
        {modes.map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            disabled={pending || !text.trim()}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await improveText(brandId, text, mode);
                if (r.ok) setResult(r.data.text);
                else setError(r.message);
              })
            }
            className="rounded-md border border-line px-2.5 py-1 text-[13px] hover:border-accent disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
      {!text.trim() ? <p className="text-[12px] text-muted">Write something first, then the assistant can rework it.</p> : null}
      {pending ? <p className="text-[13px] text-muted">Rewriting…</p> : null}
      {error ? <p role="alert" className="text-[13px] text-danger">{error}</p> : null}
      {result ? (
        <div className="rounded-md border border-accent p-2.5">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{result}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onUse(result);
                setResult(null);
              }}
              className="rounded-md bg-accent px-2.5 py-1 text-[13px] font-medium text-white"
            >
              Use this
            </button>
            <button type="button" onClick={() => setResult(null)} className="rounded-md border border-line px-2.5 py-1 text-[13px]">
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
