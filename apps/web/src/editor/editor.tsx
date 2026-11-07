"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BlockType, StrategyFieldKey } from "@stela/brand-schema";
import { Canvas, STRATEGY_LABELS, type CanvasActions } from "./canvas";
import {
  addBlock,
  addSection,
  childSections,
  deleteBlock,
  deleteSection,
  duplicateBlock,
  duplicateSection,
  moveBlock,
  moveSection,
  setStrategy,
  topLevelAncestor,
  updateBlockLayout,
  updateBlockProps,
  updateSection,
  type BlockRow,
  type Draft,
  type SectionRow,
} from "./model";
import { SectionTree, type TreeActions } from "./section-tree";
import { useDraft, type SaveStatus } from "./use-draft";

export type EditorBrand = { id: string; name: string; status: string };

export function Editor({ brand, initial, rev }: { brand: EditorBrand; initial: Draft; rev: number }) {
  const { draft, status, run } = useDraft(brand.id, initial, rev);
  const firstTop = childSections(initial, null)[0]?.id ?? null;
  const [sectionId, setSectionId] = useState<string | null>(firstTop);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [focusSection, setFocusSection] = useState<string | null>(null);

  const selectedSection = sectionId ? draft.sections[sectionId] : undefined;
  const rootId = selectedSection ? topLevelAncestor(draft, selectedSection.id) : childSections(draft, null)[0]?.id ?? null;
  const selectedBlock = blockId ? draft.blocks[blockId] : undefined;

  const selectSection = (id: string) => {
    setSectionId(id);
    setBlockId(null);
    setFocusSection(id);
  };

  const tree: TreeActions = useMemo(
    () => ({
      select: selectSection,
      rename: (id, title) => run((d) => updateSection(d, id, { title })),
      toggleHidden: (id) => run((d) => updateSection(d, id, { hidden: !d.sections[id]?.hidden })),
      addChild: (parentId) => {
        const r = run((d) => addSection(d, parentId, "New subsection"));
        if (r.created) selectSection(r.created);
      },
      duplicate: (id) => {
        const r = run((d) => duplicateSection(d, id));
        if (r.created) selectSection(r.created);
      },
      remove: (id) => {
        const s = draft.sections[id];
        if (!s || !window.confirm(`Delete "${s.title}" and everything inside it? You can't undo this.`)) return;
        run((d) => deleteSection(d, id));
        const remaining = childSections(draft, null).filter((x) => x.id !== id);
        setSectionId(s.parent_id ?? remaining[0]?.id ?? null);
        setBlockId(null);
      },
      move: (id, index) => run((d) => moveSection(d, id, index)),
      addTop: () => {
        const r = run((d) => addSection(d, null, "New section"));
        if (r.created) selectSection(r.created);
      },
    }),
    [run, draft],
  );

  const canvas: CanvasActions = {
    selectBlock: setBlockId,
    selectSection: (id) => {
      setSectionId(id);
      setBlockId(null);
    },
    setBlockProps: (id, props) => run((d) => updateBlockProps(d, id, props)),
    setStrategy: (key, value) => run((d) => setStrategy(d, key, value)),
    addBlock: (sid, type, afterId, props) => {
      const r = run((d) => addBlock(d, sid, type, afterId, props));
      if (r.created) setBlockId(r.created);
    },
    moveBlock: (id, dir) => run((d) => moveBlock(d, id, dir)),
    duplicateBlock: (id) => {
      const r = run((d) => duplicateBlock(d, id));
      if (r.created) setBlockId(r.created);
    },
    removeBlock: (id) => {
      run((d) => deleteBlock(d, id));
      setBlockId(null);
    },
  };

  return (
    <div className="flex min-h-[calc(100vh-61px)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-5 py-2.5">
        <Link href="/dashboard" className="text-sm text-muted no-underline hover:text-ink">
          ← Brands
        </Link>
        <span className="h-5 w-px bg-line" />
        <span className="font-semibold">{brand.name}</span>
        <span className="rounded-full bg-[#f0eee8] px-2 py-0.5 text-xs capitalize text-muted">{brand.status}</span>
        <SaveIndicator status={status} />
        <div className="flex-1" />
        <span className="text-xs text-subtle">Preview and publishing arrive in the next stages.</span>
      </div>

      {status.state === "conflict" || status.state === "error" ? <SaveProblem status={status} /> : null}

      <div className="flex flex-1 flex-wrap">
        <aside className="max-h-[calc(100vh-110px)] w-full overflow-auto border-r border-line bg-surface p-3 md:sticky md:top-0 md:w-[280px]">
          <SectionTree draft={draft} selectedId={sectionId} actions={tree} />
        </aside>

        <main className="min-w-0 flex-[999_1_480px] bg-paper p-4 md:p-8">
          {rootId ? (
            <Canvas draft={draft} rootId={rootId} selectedBlockId={blockId} focusSectionId={focusSection} actions={canvas} />
          ) : (
            <EmptyGuide onAdd={tree.addTop} />
          )}
        </main>

        <aside className="w-full border-l border-line bg-surface p-5 lg:w-[300px]" aria-label="Settings">
          {selectedBlock ? (
            <BlockSettings block={selectedBlock} onLayout={(layout) => run((d) => updateBlockLayout(d, selectedBlock.id, layout))} onProps={(props) => run((d) => updateBlockProps(d, selectedBlock.id, props))} />
          ) : selectedSection ? (
            <SectionSettings section={selectedSection} tree={tree} />
          ) : (
            <p className="text-sm text-muted">Select a section or block to see its settings.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const text =
    status.state === "saved" ? "All changes saved"
    : status.state === "pending" ? "Unsaved changes"
    : status.state === "saving" ? "Saving…"
    : status.state === "retrying" ? status.message
    : "Not saved";
  const tone =
    status.state === "saved" ? "text-success"
    : status.state === "retrying" ? "text-[#8a5a00]"
    : status.state === "conflict" || status.state === "error" ? "text-danger"
    : "text-muted";
  return (
    <span role="status" aria-live="polite" className={`text-[13px] ${tone}`}>
      {text}
    </span>
  );
}

function SaveProblem({ status }: { status: Extract<SaveStatus, { state: "conflict" | "error" }> }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-[#f0c9c0] bg-[#fbe9e5] px-5 py-3 text-sm text-danger">
      <span>
        {status.message} Your latest edits are kept in this tab but were not saved. Reloading loads the saved version.
      </span>
      <button type="button" onClick={() => window.location.reload()} className="rounded-md border border-danger px-3 py-1.5 hover:bg-white">
        Reload the guide
      </button>
    </div>
  );
}

function SectionSettings({ section, tree }: { section: SectionRow; tree: TreeActions }) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <div>
        <span className="text-xs uppercase tracking-[0.08em] text-muted">Section</span>
        <h2 className="mt-1 text-base font-semibold">{section.title}</h2>
      </div>
      <label className="flex flex-col gap-1.5 font-medium">
        Name
        <input
          key={section.id}
          defaultValue={section.title}
          maxLength={120}
          onBlur={(e) => e.currentTarget.value !== section.title && tree.rename(section.id, e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-10 rounded-[var(--radius-control)] border border-line-strong px-3 font-normal outline-none focus:border-accent"
        />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={!section.hidden} onChange={() => tree.toggleHidden(section.id)} />
        Show in the published guide
      </label>
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <button type="button" onClick={() => tree.addChild(section.id)} className="rounded-md border border-line px-3 py-2 text-left hover:bg-paper">
          Add subsection
        </button>
        <button type="button" onClick={() => tree.duplicate(section.id)} className="rounded-md border border-line px-3 py-2 text-left hover:bg-paper">
          Duplicate section
        </button>
        <button type="button" onClick={() => tree.remove(section.id)} className="rounded-md border border-line px-3 py-2 text-left text-danger hover:bg-paper">
          Delete section
        </button>
      </div>
    </div>
  );
}

const BLOCK_NAMES: Partial<Record<BlockType, string>> = {
  text: "Text",
  heading: "Heading",
  strategy_field: "Strategy field",
  divider: "Divider",
};

function BlockSettings({ block, onLayout, onProps }: {
  block: BlockRow;
  onLayout: (layout: Partial<BlockRow["layout"]>) => void;
  onProps: (props: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <div>
        <span className="text-xs uppercase tracking-[0.08em] text-muted">Selected block</span>
        <h2 className="mt-1 text-base font-semibold">
          {block.type === "strategy_field" ? STRATEGY_LABELS[block.props.fieldKey as StrategyFieldKey] : BLOCK_NAMES[block.type] ?? block.type}
        </h2>
      </div>
      <Segmented
        label="Width"
        value={block.layout.width}
        options={[
          ["wide", "Wide"],
          ["narrow", "Narrow"],
        ]}
        onChange={(v) => onLayout({ width: v as BlockRow["layout"]["width"] })}
      />
      {block.type === "heading" ? (
        <Segmented
          label="Size"
          value={String(block.props.level ?? 2)}
          options={[
            ["1", "Large"],
            ["2", "Medium"],
            ["3", "Small"],
          ]}
          onChange={(v) => onProps({ ...block.props, level: Number(v) })}
        />
      ) : null}
      {block.type === "strategy_field" ? (
        <>
          <Segmented
            label="Display"
            value={String(block.props.display ?? "body")}
            options={[
              ["statement", "Statement"],
              ["body", "Paragraph"],
              ["list", "List"],
            ]}
            onChange={(v) => onProps({ ...block.props, display: v })}
          />
          <p className="rounded-md bg-paper p-3 text-[13px] leading-relaxed text-muted">
            Strategy fields are shared. Editing this text changes it everywhere this field appears, and the assistant will
            read it in Phase 2.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Segmented({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 font-medium">{label}</legend>
      <div className="flex overflow-hidden rounded-[var(--radius-control)] border border-line">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`flex-1 px-2 py-2 ${value === v ? "bg-ink text-white" : "bg-surface hover:bg-paper"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function EmptyGuide({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <p className="font-[family-name:var(--font-display)] text-3xl">An empty guide</p>
      <p className="text-sm text-muted">Add your first section to start building.</p>
      <button type="button" onClick={onAdd} className="rounded-[var(--radius-control)] bg-ink px-4 py-2.5 text-sm font-medium text-white">
        Add a section
      </button>
    </div>
  );
}
