import { z } from "zod";
import { Id, StrategyFieldKey } from "./entities";

/**
 * Block registry: the content types a section can hold.
 *
 * Blocks never copy brand values. A palette references colour token ids, a
 * type specimen references type style ids, a strategy block references a
 * strategy field key. The renderer resolves them, so one edit to a token or
 * field shows everywhere it is used.
 *
 * Adding a block type = add its props schema here + Render/Edit/toMarkdown in
 * the blocks package. Nothing else switches on block type.
 */

/** Rich text stored as Tiptap/ProseMirror JSON. Validated loosely here; the editor owns its shape. */
export const RichTextDoc = z.object({
  type: z.literal("doc"),
  content: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type RichTextDoc = z.infer<typeof RichTextDoc>;

export const EMPTY_DOC: RichTextDoc = { type: "doc", content: [] };

const caption = z.string().max(300).nullable().default(null);

export const BlockProps = {
  text: z.object({
    doc: RichTextDoc.default(EMPTY_DOC),
  }),
  heading: z.object({
    text: z.string().max(200).default(""),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  }),
  image: z.object({
    assetId: Id.nullable().default(null),
    alt: z.string().max(300).default(""),
    caption,
    fit: z.enum(["cover", "contain"]).default("contain"),
    background: Id.nullable().default(null), // colour token id
  }),
  video: z.object({
    assetId: Id.nullable().default(null),
    caption,
    autoplay: z.boolean().default(false),
    loop: z.boolean().default(false),
  }),
  gallery: z.object({
    assetIds: z.array(Id).max(60).default([]),
    columns: z.number().int().min(1).max(6).default(3),
    caption,
  }),
  file_download: z.object({
    assetIds: z.array(Id).max(60).default([]),
    label: z.string().max(80).default("Download"),
  }),
  palette: z.object({
    tokenIds: z.array(Id).max(40).default([]),
    layout: z.enum(["columns", "grid", "stacked"]).default("columns"),
    show: z
      .object({
        hex: z.boolean().default(true),
        rgb: z.boolean().default(true),
        cmyk: z.boolean().default(true),
        pantone: z.boolean().default(false),
      })
      .default({ hex: true, rgb: true, cmyk: true, pantone: false }),
  }),
  color_combinations: z.object({
    pairs: z
      .array(z.object({ foregroundId: Id, backgroundId: Id }))
      .max(24)
      .default([]),
  }),
  type_specimen: z.object({
    styleIds: z.array(Id).max(20).default([]),
    sampleText: z.string().max(300).default("The quick brown fox jumps over the lazy dog"),
    showDetails: z.boolean().default(true),
  }),
  type_family: z.object({
    familyId: Id.nullable().default(null),
    showWeights: z.boolean().default(true),
    showCharacters: z.boolean().default(true),
  }),
  strategy_field: z.object({
    fieldKey: StrategyFieldKey,
    display: z.enum(["statement", "body", "list"]).default("body"),
  }),
  dos_donts: z.object({
    items: z
      .array(
        z.object({
          assetId: Id.nullable(),
          kind: z.enum(["do", "dont"]),
          note: z.string().max(300),
        }),
      )
      .max(24)
      .default([]),
  }),
  grid: z.object({
    columns: z.number().int().min(1).max(4).default(2),
    gap: z.enum(["none", "small", "medium", "large"]).default("medium"),
  }),
  divider: z.object({}),
} as const;

export type BlockType = keyof typeof BlockProps;
export const BLOCK_TYPES = Object.keys(BlockProps) as BlockType[];
export const BlockTypeSchema = z.enum(BLOCK_TYPES as [BlockType, ...BlockType[]]);

/** Block types that hold child blocks (children carry parentBlockId). */
export const CONTAINER_BLOCK_TYPES: ReadonlySet<BlockType> = new Set(["grid"]);

export type BlockPropsOf<T extends BlockType> = z.infer<(typeof BlockProps)[T]>;

export const BlockLayout = z.object({
  width: z.enum(["full", "wide", "narrow"]).default("wide"),
  span: z.number().int().min(1).max(4).default(1), // column span inside a grid
});
export type BlockLayout = z.infer<typeof BlockLayout>;

export const BlockOrigin = z.enum(["manual", "ai"]);

export const Block = z.object({
  id: Id,
  sectionId: Id,
  parentBlockId: Id.nullable(),
  type: BlockTypeSchema,
  position: z.number(),
  props: z.record(z.string(), z.unknown()),
  layout: BlockLayout,
  origin: BlockOrigin,
  schemaVersion: z.number().int().positive(),
});
export type Block = z.infer<typeof Block>;

export const CURRENT_BLOCK_SCHEMA_VERSION = 1;

/** Validate and fill defaults for a block's props. Throws a ZodError on invalid props. */
export function parseBlockProps<T extends BlockType>(type: T, props: unknown): BlockPropsOf<T> {
  const schema = BlockProps[type];
  if (!schema) throw new Error(`Unknown block type: ${String(type)}`);
  return schema.parse(props ?? {}) as BlockPropsOf<T>;
}

export function safeParseBlockProps(type: string, props: unknown) {
  if (!(type in BlockProps)) {
    return { success: false as const, error: new Error(`Unknown block type: ${type}`) };
  }
  return BlockProps[type as BlockType].safeParse(props ?? {});
}

/** Default props for a new block of a type. strategy_field requires a key, so it is supplied. */
export function defaultBlockProps<T extends BlockType>(
  type: T,
  overrides: Partial<BlockPropsOf<T>> = {},
): BlockPropsOf<T> {
  return parseBlockProps(type, overrides);
}

/** Every id a block references, used to validate references and to collect assets for downloads. */
export function blockReferences(type: BlockType, props: unknown): {
  assetIds: string[];
  colorTokenIds: string[];
  typeStyleIds: string[];
  typeFamilyIds: string[];
} {
  const refs = { assetIds: [] as string[], colorTokenIds: [] as string[], typeStyleIds: [] as string[], typeFamilyIds: [] as string[] };
  const p = parseBlockProps(type, props) as Record<string, unknown>;
  switch (type) {
    case "image": {
      const ip = p as BlockPropsOf<"image">;
      if (ip.assetId) refs.assetIds.push(ip.assetId);
      if (ip.background) refs.colorTokenIds.push(ip.background);
      break;
    }
    case "video": {
      const vp = p as BlockPropsOf<"video">;
      if (vp.assetId) refs.assetIds.push(vp.assetId);
      break;
    }
    case "gallery":
    case "file_download":
      refs.assetIds.push(...(p as { assetIds: string[] }).assetIds);
      break;
    case "palette":
      refs.colorTokenIds.push(...(p as BlockPropsOf<"palette">).tokenIds);
      break;
    case "color_combinations":
      for (const pair of (p as BlockPropsOf<"color_combinations">).pairs) {
        refs.colorTokenIds.push(pair.foregroundId, pair.backgroundId);
      }
      break;
    case "type_specimen":
      refs.typeStyleIds.push(...(p as BlockPropsOf<"type_specimen">).styleIds);
      break;
    case "type_family": {
      const fp = p as BlockPropsOf<"type_family">;
      if (fp.familyId) refs.typeFamilyIds.push(fp.familyId);
      break;
    }
    case "dos_donts":
      for (const item of (p as BlockPropsOf<"dos_donts">).items) {
        if (item.assetId) refs.assetIds.push(item.assetId);
      }
      break;
    default:
      break;
  }
  return refs;
}
