"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { getPublishState, publishBrand, restoreVersion, setGuideAccess, type PublishState } from "@/app/(app)/brands/[id]/publish-actions";
import type { SaveStatus } from "./use-draft";

export type PublishedInfo = { number: number; draftRev: number };

export function PublishPanel({ brand, status, published }: {
  brand: { id: string; slug: string };
  status: SaveStatus;
  published: PublishedInfo | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PublishState | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [origin, setOrigin] = useState("");

  const refresh = () =>
    start(async () => {
      const r = await getPublishState(brand.id);
      if (r.ok) setState(r.data);
      else setMessage({ tone: "error", text: r.message });
    });

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saving = status.state === "pending" || status.state === "saving" || status.state === "retrying";
  const blocked = status.state === "conflict" || status.state === "error";
  const live = state ? state.currentVersionId && state.visibility !== "unpublished" : Boolean(published);
  const current = state?.versions.find((v) => v.id === state.currentVersionId);
  const link = origin && state ? `${origin}/g/${state.slug}` : "";

  const doPublish = () =>
    start(async () => {
      setMessage(null);
      const r = await publishBrand(brand.id, note);
      if (r.ok) {
        setNote("");
        setMessage({ tone: "ok", text: `Version ${r.data.number} is live.` });
      } else setMessage({ tone: "error", text: r.message });
      const s = await getPublishState(brand.id);
      if (s.ok) setState(s.data);
    });

  const doAccess = (visibility: PublishState["visibility"]) =>
    start(async () => {
      setMessage(null);
      if (visibility === "password" && !password && !state?.hasPassword) {
        setMessage({ tone: "error", text: "Enter a password of at least 6 characters first." });
        return;
      }
      const r = await setGuideAccess(brand.id, visibility, visibility === "password" ? password : undefined);
      if (!r.ok) setMessage({ tone: "error", text: r.message });
      else {
        setPassword("");
        setMessage({ tone: "ok", text: visibility === "unpublished" ? "The guide is offline." : "Access updated." });
      }
      const s = await getPublishState(brand.id);
      if (s.ok) setState(s.data);
    });

  const doRestore = (versionId: string, number: number) => {
    if (!window.confirm(`Make version ${number} live again? It is republished as a new version; your draft is not changed.`)) return;
    start(async () => {
      const r = await restoreVersion(brand.id, versionId);
      setMessage(r.ok ? { tone: "ok", text: `Version ${number} restored as version ${r.data.number}.` } : { tone: "error", text: r.message });
      const s = await getPublishState(brand.id);
      if (s.ok) setState(s.data);
    });
  };

  return (
    <div className="relative flex items-center gap-2">
      <Link href={`/preview/${brand.id}`} target="_blank" className="rounded-[var(--radius-control)] border border-line bg-surface px-3 py-1.5 text-sm text-ink no-underline hover:border-line-strong">
        Preview
      </Link>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-[var(--radius-control)] bg-ink px-3.5 py-1.5 text-sm font-medium text-white"
      >
        Publish
        {published ? <span className="rounded-full bg-white/15 px-1.5 text-xs font-normal">v{state?.versions[0]?.number ?? published.number}</span> : null}
      </button>

      {open ? (
        <div role="dialog" aria-label="Publish" className="absolute right-0 top-10 z-30 flex w-[min(380px,90vw)] flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm shadow-xl">
          <div className="flex items-center gap-2">
            <strong className="text-base">Publish guide</strong>
            <span className="flex-1" />
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-muted hover:text-ink">
              ✕
            </button>
          </div>

          {live && link ? (
            <div className="flex flex-col gap-1.5 rounded-md bg-paper p-3">
              <span className="text-xs text-muted">
                Live{current ? ` · version ${current.number}` : ""}
                {state?.visibility === "password" ? " · password protected" : ""}
              </span>
              <div className="flex items-center gap-2">
                <a href={link} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-accent">
                  {link}
                </a>
                <button type="button" onClick={() => navigator.clipboard?.writeText(link)} className="rounded border border-line px-2 py-1 text-xs hover:bg-surface">
                  Copy
                </button>
              </div>
            </div>
          ) : (
            <p className="rounded-md bg-paper p-3 text-muted">Not live. Publishing creates a link you can share; your draft stays private.</p>
          )}

          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              What changed? <span className="font-normal text-muted">Optional, shown in version history</span>
              <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="h-9 rounded-[var(--radius-control)] border border-line-strong px-2.5 text-sm font-normal outline-none focus:border-accent" />
            </label>
            <button
              type="button"
              disabled={pending || saving || blocked}
              onClick={doPublish}
              className="rounded-[var(--radius-control)] bg-ink px-3 py-2.5 font-medium text-white disabled:opacity-50"
            >
              {saving ? "Waiting for edits to save…" : pending ? "Working…" : live ? "Publish changes" : "Publish"}
            </button>
            {blocked ? <p className="text-xs text-danger">Fix the saving problem shown above before publishing.</p> : null}
          </div>

          {message ? <p role="status" className={`text-[13px] ${message.tone === "ok" ? "text-success" : "text-danger"}`}>{message.text}</p> : null}

          {state?.currentVersionId ? (
            <fieldset className="flex flex-col gap-2 border-t border-line pt-3">
              <legend className="mb-1 pt-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Who can see it</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="access" checked={state.visibility === "public"} onChange={() => doAccess("public")} disabled={pending} />
                Anyone with the link
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="access" checked={state.visibility === "password"} onChange={() => doAccess("password")} disabled={pending} />
                Only people with the password
              </label>
              <div className="ml-6 flex gap-2">
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={state.visibility === "password" ? "New password" : "Password (6+ characters)"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-8 min-w-0 flex-1 rounded border border-line-strong px-2 text-sm outline-none focus:border-accent"
                />
                <button type="button" disabled={pending || password.length < 6} onClick={() => doAccess("password")} className="rounded border border-line px-2 text-xs disabled:opacity-40">
                  Set
                </button>
              </div>
              <label className="flex items-center gap-2">
                <input type="radio" name="access" checked={state.visibility === "unpublished"} onChange={() => doAccess("unpublished")} disabled={pending} />
                Offline (unpublished)
              </label>
            </fieldset>
          ) : null}

          {state?.versions.length ? (
            <div className="flex flex-col gap-1.5 border-t border-line pt-3">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Version history</span>
              <ul className="flex max-h-48 list-none flex-col gap-1 overflow-auto p-0">
                {state.versions.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-paper">
                    <span className="w-8 font-medium">v{v.number}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">
                      {new Date(v.publishedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {v.note ? ` · ${v.note}` : ""}
                    </span>
                    {v.id === state.currentVersionId ? (
                      <span className="text-xs text-success">Live</span>
                    ) : (
                      <button type="button" disabled={pending} onClick={() => doRestore(v.id, v.number)} className="text-xs text-accent hover:underline">
                        Restore
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
