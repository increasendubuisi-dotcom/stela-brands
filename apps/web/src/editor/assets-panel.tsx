"use client";

import { useRef, useState } from "react";
import { ASSET_CATEGORIES, isFont, isImage, isVideo, libraryAssets } from "./assets";
import type { AssetCategory, AssetRow, Draft } from "./model";
import { PlusIcon } from "./section-tree";

export type AssetActions = {
  upload: (files: File[]) => Promise<void>;
  update: (id: string, patch: Partial<Pick<AssetRow, "name" | "category" | "client_visible">>) => void;
  remove: (id: string) => void;
};

export type UploadState = { active: number; errors: string[] };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AssetThumb({ asset, url, className = "" }: { asset: AssetRow; url?: string; className?: string }) {
  if (url && isImage(asset)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`object-contain ${className}`} />;
  }
  const label = isVideo(asset) ? "VIDEO" : isFont(asset) ? "FONT" : (asset.name.split(".").pop() ?? "FILE").toUpperCase().slice(0, 5);
  return <span className={`flex items-center justify-center text-[11px] font-semibold tracking-wider text-muted ${className}`}>{label}</span>;
}

export function AssetsPanel({ draft, urls, upload, actions, limitMb }: {
  draft: Draft;
  urls: Record<string, string>;
  upload: UploadState;
  actions: AssetActions;
  limitMb: number;
}) {
  const [filter, setFilter] = useState<AssetCategory | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const assets = libraryAssets(draft, filter);
  const counts = new Map<string, number>();
  for (const a of Object.values(draft.assets)) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  const open = openId ? draft.assets[openId] : undefined;

  return (
    <div
      className={`flex flex-col gap-3 text-sm ${dragging ? "rounded-md outline-2 outline-dashed outline-accent" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = [...e.dataTransfer.files];
        if (files.length) void actions.upload(files);
      }}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-ink px-3 py-2.5 text-white"
      >
        <PlusIcon /> Upload files
      </button>
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        aria-label="Upload files"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) void actions.upload(files);
          e.target.value = "";
        }}
      />
      <p className="text-xs text-muted">Or drop files here. Up to {limitMb} MB each. Files are private until you publish and mark them for download.</p>
      {upload.active ? <p role="status" className="text-xs text-accent">Uploading {upload.active} file{upload.active === 1 ? "" : "s"}…</p> : null}
      {upload.errors.map((e) => (
        <p key={e} role="alert" className="text-xs text-danger">
          {e}
        </p>
      ))}

      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by category">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All {Object.keys(draft.assets).length}
        </FilterChip>
        {ASSET_CATEGORIES.filter((c) => counts.get(c.key)).map((c) => (
          <FilterChip key={c.key} active={filter === c.key} onClick={() => setFilter(c.key)}>
            {c.label} {counts.get(c.key)}
          </FilterChip>
        ))}
      </div>

      {assets.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong p-4 text-center text-xs text-muted">No files yet.</p>
      ) : (
        <ul className="grid list-none grid-cols-2 gap-2 p-0">
          {assets.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setOpenId(openId === a.id ? null : a.id)}
                aria-pressed={openId === a.id}
                className={`flex w-full flex-col gap-1 rounded-md border p-1.5 text-left ${openId === a.id ? "border-accent" : "border-line hover:border-line-strong"}`}
              >
                <AssetThumb asset={a} url={urls[a.id]} className="h-20 w-full rounded bg-paper" />
                <span className="truncate text-xs">{a.name}</span>
                {a.client_visible ? <span className="text-[11px] text-success">Downloadable</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? <AssetDetails asset={open} url={urls[open.id]} actions={actions} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function AssetDetails({ asset, url, actions, onClose }: { asset: AssetRow; url?: string; actions: AssetActions; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--radius-card)] border border-line-strong bg-paper p-3">
      <AssetThumb asset={asset} url={url} className="h-32 w-full rounded bg-surface" />
      <label className="flex flex-col gap-1 text-xs font-medium">
        Name
        <input
          key={asset.name}
          defaultValue={asset.name}
          maxLength={200}
          onBlur={(e) => e.currentTarget.value !== asset.name && actions.update(asset.id, { name: e.currentTarget.value })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-9 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2.5 text-sm outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Category
        <select
          value={asset.category}
          onChange={(e) => actions.update(asset.id, { category: e.target.value as AssetCategory })}
          className="h-9 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 text-sm"
        >
          {ASSET_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-start gap-2 text-[13px]">
        <input type="checkbox" className="mt-0.5" checked={asset.client_visible} onChange={(e) => actions.update(asset.id, { client_visible: e.target.checked })} />
        <span>
          Clients can download this
          <span className="block text-xs text-muted">
            {asset.category === "font" ? "Fonts also need the typeface marked as licensed for distribution." : "Appears in the guide's download area once published."}
          </span>
        </span>
      </label>
      <p className="text-xs text-muted">
        {formatBytes(asset.size)}
        {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""} · {asset.mime}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => actions.remove(asset.id)} className="rounded-md px-2 py-1.5 text-xs text-danger hover:bg-surface">
          Remove from library
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1.5 text-xs hover:bg-surface">
          Close
        </button>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs ${active ? "border-ink bg-ink text-white" : "border-line hover:border-line-strong"}`}
    >
      {children}
    </button>
  );
}

/** Choose one or several library files, optionally limited to images or videos. */
export function AssetPicker({ draft, urls, kind, selected, multiple, onChange, onUpload }: {
  draft: Draft;
  urls: Record<string, string>;
  kind: "image" | "video" | "any";
  selected: string[];
  multiple: boolean;
  onChange: (ids: string[]) => void;
  onUpload: () => void;
}) {
  const assets = Object.values(draft.assets)
    .filter((a) => kind === "any" || (kind === "image" ? isImage(a) : isVideo(a)))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!assets.length) {
    return (
      <p className="rounded-md bg-paper p-3 text-[13px] text-muted">
        No {kind === "image" ? "images" : kind === "video" ? "videos" : "files"} in the library yet.{" "}
        <button type="button" onClick={onUpload} className="text-accent hover:underline">
          Upload in Assets
        </button>
      </p>
    );
  }
  return (
    <ul className="grid max-h-72 list-none grid-cols-3 gap-1.5 overflow-auto p-0">
      {assets.map((a) => {
        const on = selected.includes(a.id);
        return (
          <li key={a.id}>
            <button
              type="button"
              aria-pressed={on}
              title={a.name}
              onClick={() => onChange(multiple ? (on ? selected.filter((x) => x !== a.id) : [...selected, a.id]) : on ? [] : [a.id])}
              className={`flex w-full flex-col gap-0.5 rounded border p-1 text-left ${on ? "border-accent ring-2 ring-accent/40" : "border-line"}`}
            >
              <AssetThumb asset={a} url={urls[a.id]} className="h-14 w-full rounded bg-paper" />
              <span className="truncate text-[11px]">{a.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
