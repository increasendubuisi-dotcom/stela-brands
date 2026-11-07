"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { STRATEGY_FIELD_KEYS, type BlockType, type StrategyFieldKey } from "@stela/brand-schema";
import { childSections, docToText, sectionBlocks, strategyText, textToDoc, type BlockRow, type Draft, type SectionRow } from "./model";
import { PlusIcon } from "./section-tree";

export const STRATEGY_LABELS: Record<StrategyFieldKey, string> = {
  overview: "Brand overview",
  story: "Brand story",
  mission: "Mission",
  vision: "Vision",
  purpose: "Brand purpose",
  values: "Brand values",
  positioning: "Brand positioning",
  audience: "Target audience",
  personality: "Brand personality",
  archetype: "Brand archetype",
  promise: "Brand promise",
  messaging: "Brand messaging",
  tone: "Tone of voice",
};

const LATER_STAGE: Partial<Record<BlockType, string>> = {
  palette: "Colour palette",
  color_combinations: "Colour combinations",
  type_specimen: "Type specimen",
  type_family: "Typeface",
  image: "Image",
  video: "Video",
  gallery: "Image gallery",
  file_download: "File download",
  dos_donts: "Do's and don'ts",
  grid: "Grid",
};

export type CanvasActions = {
  selectBlock: (id: string | null) => void;
  selectSection: (id: string) => void;
  setBlockProps: (id: string, props: Record<string, unknown>) => void;
  setStrategy: (key: StrategyFieldKey, value: string) => void;
  addBlock: (sectionId: string, type: BlockType, afterId: string | null, props?: Record<string, unknown>) => void;
  moveBlock: (id: string, dir: -1 | 1) => void;
  duplicateBlock: (id: string) => void;
  removeBlock: (id: string) => void;
};

/** Renders a top-level section and everything nested under it, as one page of the guide. */
export function Canvas({ draft, rootId, selectedBlockId, focusSectionId, actions }: {
  draft: Draft;
  rootId: string;
  selectedBlockId: string | null;
  focusSectionId: string | null;
  actions: CanvasActions;
}) {
  const root = draft.sections[rootId];
  const index = childSections(draft, null).findIndex((s) => s.id === rootId);

  useEffect(() => {
    if (!focusSectionId) return;
    document.getElementById(`section-${focusSectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusSectionId]);

  if (!root) return null;
  return (
    <article
      className="mx-auto flex w-full max-w-[780px] flex-col gap-2 rounded bg-white px-6 py-10 shadow-[0_0_0_1px_var(--color-line)] md:px-14 md:py-14"
      onClick={(e) => {
        if (e.target === e.currentTarget) actions.selectBlock(null);
      }}
    >
      {root.hidden ? <HiddenNote /> : null}
      <span className="text-xs uppercase tracking-[0.14em] text-subtle">{String(index + 1).padStart(2, "0")}</span>
      <SectionBody draft={draft} section={root} depth={0} selectedBlockId={selectedBlockId} actions={actions} />
    </article>
  );
}

function SectionBody({ draft, section, depth, selectedBlockId, actions }: {
  draft: Draft;
  section: SectionRow;
  depth: number;
  selectedBlockId: string | null;
  actions: CanvasActions;
}) {
  const blocks = sectionBlocks(draft, section.id);
  const HeadingTag = depth === 0 ? "h1" : depth === 1 ? "h2" : "h3";
  const headingSize = depth === 0 ? "text-5xl" : depth === 1 ? "text-[28px]" : "text-xl";
  return (
    <section id={`section-${section.id}`} className={`scroll-mt-6 ${depth ? "mt-10 border-t border-line pt-8" : ""} ${section.hidden ? "opacity-60" : ""}`}>
      <HeadingTag
        className={`mb-4 cursor-pointer font-[family-name:var(--font-display)] leading-tight ${headingSize}`}
        onClick={() => actions.selectSection(section.id)}
      >
        {section.title}
        {depth > 0 && section.hidden ? <span className="ml-2 align-middle font-sans text-xs text-subtle">Hidden</span> : null}
      </HeadingTag>
      <AddBlockMenu sectionId={section.id} afterId={null} actions={actions} compact={blocks.length > 0} />
      {blocks.map((b, i) => (
        <div key={b.id}>
          <BlockFrame
            block={b}
            selected={b.id === selectedBlockId}
            isFirst={i === 0}
            isLast={i === blocks.length - 1}
            actions={actions}
          >
            <BlockView draft={draft} block={b} actions={actions} />
          </BlockFrame>
          <AddBlockMenu sectionId={section.id} afterId={b.id} actions={actions} compact />
        </div>
      ))}
      {childSections(draft, section.id).map((child) => (
        <SectionBody key={child.id} draft={draft} section={child} depth={depth + 1} selectedBlockId={selectedBlockId} actions={actions} />
      ))}
    </section>
  );
}

function BlockFrame({ block, selected, isFirst, isLast, actions, children }: {
  block: BlockRow;
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  actions: CanvasActions;
  children: ReactNode;
}) {
  const width = block.layout.width === "narrow" ? "max-w-[520px]" : "";
  return (
    <div
      className={`group relative -mx-3 rounded-md px-3 py-2 ${selected ? "outline outline-2 outline-accent" : "hover:outline hover:outline-1 hover:outline-line-strong"}`}
      onFocusCapture={() => actions.selectBlock(block.id)}
      onMouseDown={() => actions.selectBlock(block.id)}
    >
      <div
        role="toolbar"
        aria-label="Block actions"
        className={`absolute -top-4 right-2 z-10 flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5 text-xs shadow-sm ${selected ? "flex" : "hidden group-hover:flex"}`}
      >
        <ToolButton label="Move block up" disabled={isFirst} onClick={() => actions.moveBlock(block.id, -1)}>↑</ToolButton>
        <ToolButton label="Move block down" disabled={isLast} onClick={() => actions.moveBlock(block.id, 1)}>↓</ToolButton>
        <ToolButton label="Duplicate block" onClick={() => actions.duplicateBlock(block.id)}>Duplicate</ToolButton>
        <ToolButton label="Delete block" onClick={() => actions.removeBlock(block.id)} danger>Delete</ToolButton>
      </div>
      <div className={width}>{children}</div>
    </div>
  );
}

function ToolButton({ label, onClick, disabled, danger, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={`rounded px-2 py-1 hover:bg-paper disabled:opacity-30 ${danger ? "text-danger" : ""}`}
    >
      {children}
    </button>
  );
}

function BlockView({ draft, block, actions }: { draft: Draft; block: BlockRow; actions: CanvasActions }) {
  switch (block.type) {
    case "text":
      return (
        <AutoTextarea
          ariaLabel="Text"
          placeholder="Write something…"
          value={docToText(block.props.doc)}
          onChange={(v) => actions.setBlockProps(block.id, { ...block.props, doc: textToDoc(v) })}
          className="text-[17px] leading-relaxed"
        />
      );
    case "heading": {
      const level = (block.props.level as number) ?? 2;
      return (
        <input
          aria-label="Heading"
          value={String(block.props.text ?? "")}
          maxLength={200}
          placeholder="Heading"
          onChange={(e) => actions.setBlockProps(block.id, { ...block.props, text: e.target.value })}
          className={`w-full bg-transparent font-[family-name:var(--font-display)] outline-none placeholder:text-subtle ${level === 1 ? "text-4xl" : level === 2 ? "text-[28px]" : "text-xl"}`}
        />
      );
    }
    case "strategy_field": {
      const key = block.props.fieldKey as StrategyFieldKey;
      const display = block.props.display as string;
      return (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-[0.1em] text-subtle">
            {STRATEGY_LABELS[key]} <span className="normal-case tracking-normal">· shared brand strategy</span>
          </span>
          <AutoTextarea
            ariaLabel={STRATEGY_LABELS[key]}
            placeholder={display === "list" ? "One item per line" : `Write the ${STRATEGY_LABELS[key].toLowerCase()}…`}
            value={strategyText(draft.strategy[key])}
            onChange={(v) => actions.setStrategy(key, v)}
            className={display === "statement" ? "font-[family-name:var(--font-display)] text-[28px] leading-snug" : "text-[17px] leading-relaxed"}
          />
        </div>
      );
    }
    case "divider":
      return <hr className="my-3 border-line-strong" />;
    default:
      return (
        <div className="rounded-md border border-dashed border-line-strong bg-paper px-4 py-5 text-sm text-muted">
          <strong className="text-ink">{LATER_STAGE[block.type] ?? block.type}</strong> · editing for this block arrives in the next
          editor stage. It is saved and will keep its place.
        </div>
      );
  }
}

/** A textarea that grows with its content and keeps the cursor stable while saving. */
function AutoTextarea({ value, onChange, placeholder, className, ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [local]);
  return (
    <textarea
      ref={ref}
      aria-label={ariaLabel}
      rows={1}
      value={local}
      placeholder={placeholder}
      onFocus={() => (focused.current = true)}
      onBlur={() => (focused.current = false)}
      onChange={(e) => {
        setLocal(e.target.value);
        onChange(e.target.value);
      }}
      className={`block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-subtle ${className ?? ""}`}
    />
  );
}

function AddBlockMenu({ sectionId, afterId, actions, compact }: {
  sectionId: string;
  afterId: string | null;
  actions: CanvasActions;
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [askStrategy, setAskStrategy] = useState(false);
  const add = (type: BlockType, props?: Record<string, unknown>) => {
    actions.addBlock(sectionId, type, afterId, props);
    setOpen(false);
    setAskStrategy(false);
  };
  return (
    <div className={`relative flex items-center justify-center ${compact ? "h-6 opacity-0 hover:opacity-100 focus-within:opacity-100" : "my-2"} ${open ? "opacity-100" : ""}`}>
      <span className="h-px flex-1 bg-line" />
      <button
        type="button"
        aria-expanded={open}
        aria-label="Add a block here"
        onClick={() => setOpen((o) => !o)}
        className="mx-2 flex h-6 items-center gap-1 rounded-full border border-line-strong bg-surface px-2 text-xs text-muted hover:border-ink hover:text-ink"
      >
        <PlusIcon /> Add block
      </button>
      <span className="h-px flex-1 bg-line" />
      {open ? (
        <div className="absolute top-7 z-20 flex w-64 flex-col rounded-[var(--radius-card)] border border-line bg-surface p-1 text-sm shadow-lg">
          {askStrategy ? (
            <>
              <span className="px-2.5 py-1.5 text-xs text-muted">Which strategy field?</span>
              <div className="max-h-64 overflow-auto">
                {STRATEGY_FIELD_KEYS.map((k) => (
                  <button key={k} type="button" onClick={() => add("strategy_field", { fieldKey: k })} className="w-full rounded-md px-2.5 py-2 text-left hover:bg-paper">
                    {STRATEGY_LABELS[k]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <MenuChoice title="Text" hint="Paragraphs of copy" onClick={() => add("text")} />
              <MenuChoice title="Heading" hint="A title inside the section" onClick={() => add("heading")} />
              <MenuChoice title="Strategy field" hint="Mission, values, tone… shared across the guide" onClick={() => setAskStrategy(true)} />
              <MenuChoice title="Divider" hint="A horizontal rule" onClick={() => add("divider")} />
              <p className="px-2.5 py-2 text-xs text-subtle">Colour, type, image and file blocks arrive in the next stages.</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MenuChoice({ title, hint, onClick }: { title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col rounded-md px-2.5 py-2 text-left hover:bg-paper">
      <span>{title}</span>
      <span className="text-xs text-muted">{hint}</span>
    </button>
  );
}

function HiddenNote() {
  return (
    <p className="mb-4 rounded-md bg-paper px-3 py-2 text-sm text-muted">
      This section is hidden. It stays in your draft but won't appear in the published guide.
    </p>
  );
}
