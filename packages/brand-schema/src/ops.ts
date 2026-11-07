import { defaultBlockProps, type BlockType } from "./blocks";
import { POSITION_STEP } from "./position";
import { slugify, type Template, type TemplateSection } from "./templates";

/**
 * Draft operations, the unit of saving. The app sends batches of these to the
 * database function apply_draft_ops, which applies them atomically and refuses
 * the batch if the guide changed since the client last loaded it.
 * Rows use the database's snake_case column names.
 */

export const DRAFT_TABLES = [
  "sections",
  "blocks",
  "color_tokens",
  "assets",
  "type_families",
  "font_files",
  "type_styles",
  "strategy_fields",
] as const;
export type DraftTable = (typeof DRAFT_TABLES)[number];

export type DraftOp =
  | { op: "upsert"; table: DraftTable; row: Record<string, unknown> }
  | { op: "delete"; table: DraftTable; row: Record<string, unknown> };

export const MAX_OPS_PER_SAVE = 500;

/** Ops that create a template's sections and starter blocks in an empty guide. */
export function templateToOps(template: Template, newId: () => string = () => crypto.randomUUID()): DraftOp[] {
  const ops: DraftOp[] = [];
  const usedSlugs = new Set<string>();

  const uniqueSlug = (title: string) => {
    const base = slugify(title);
    let slug = base;
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
    usedSlugs.add(slug);
    return slug;
  };

  const addSection = (section: TemplateSection, parentId: string | null, index: number) => {
    const id = newId();
    ops.push({
      op: "upsert",
      table: "sections",
      row: {
        id,
        parent_id: parentId,
        title: section.title,
        slug: uniqueSlug(section.title),
        position: (index + 1) * POSITION_STEP,
        hidden: false,
        template_key: section.key,
      },
    });
    (section.blocks ?? []).forEach((block, i) => {
      ops.push({
        op: "upsert",
        table: "blocks",
        row: {
          id: newId(),
          section_id: id,
          type: block.type,
          position: (i + 1) * POSITION_STEP,
          props: defaultBlockProps(block.type as BlockType, (block.props ?? {}) as never),
          layout: { width: "wide", span: 1 },
          origin: "manual",
          schema_version: 1,
        },
      });
    });
    (section.children ?? []).forEach((child, i) => addSection(child, id, i));
  };

  template.sections.forEach((s, i) => addSection(s, null, i));

  if (ops.length > MAX_OPS_PER_SAVE) {
    throw new Error(`Template "${template.key}" creates ${ops.length} changes; the limit per save is ${MAX_OPS_PER_SAVE}`);
  }
  return ops;
}
