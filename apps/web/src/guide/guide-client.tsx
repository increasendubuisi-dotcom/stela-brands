"use client";

import { useState } from "react";

/** A value in the guide that copies itself when clicked (HEX, RGB, CMYK…). */
export function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Clipboard unavailable; the value is still visible to copy by hand.
        }
      }}
      className="flex justify-between gap-2 rounded px-0.5 text-left text-black/70 hover:bg-black/5"
    >
      <span>{value}</span>
      <span className="text-black/40">{copied ? "Copied" : ""}</span>
    </button>
  );
}

/**
 * Downloads every downloadable file and zips them in the browser, so large
 * asset packs never hit server response limits.
 */
export function DownloadAll({ endpoint, fileName }: { endpoint: string; fileName: string }) {
  const [state, setState] = useState<{ busy: boolean; done: number; total: number; error: string | null }>({ busy: false, done: 0, total: 0, error: null });

  const run = async () => {
    setState({ busy: true, done: 0, total: 0, error: null });
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) throw new Error("The download links couldn't be prepared.");
      const files = (await res.json()) as Array<{ name: string; url: string }>;
      setState((s) => ({ ...s, total: files.length }));
      const { zip } = await import("fflate");
      const entries: Record<string, Uint8Array> = {};
      const used = new Set<string>();
      for (const f of files) {
        const r = await fetch(f.url);
        if (!r.ok) throw new Error(`Couldn't download ${f.name}.`);
        let name = f.name;
        for (let n = 2; used.has(name); n++) name = f.name.replace(/(\.[^.]+)?$/, ` (${n})$1`);
        used.add(name);
        entries[name] = new Uint8Array(await r.arrayBuffer());
        setState((s) => ({ ...s, done: s.done + 1 }));
      }
      const data = await new Promise<Uint8Array>((resolve, reject) =>
        zip(entries, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out))),
      );
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState({ busy: false, done: 0, total: 0, error: null });
    } catch (e) {
      setState({ busy: false, done: 0, total: 0, error: e instanceof Error ? e.message : "Download failed." });
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button type="button" disabled={state.busy} onClick={run} className="self-start rounded-md bg-[#1b1b1b] px-4 py-2.5 text-sm text-white disabled:opacity-60">
        {state.busy ? (state.total ? `Preparing ${state.done} of ${state.total}…` : "Preparing…") : "Download all (.zip)"}
      </button>
      {state.error ? <span className="text-sm text-[#A3361F]">{state.error}</span> : null}
    </div>
  );
}
