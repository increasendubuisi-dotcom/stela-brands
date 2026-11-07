import { blockReferences, parseBlockProps, safeParseBlockProps, type Block, type BlockLayout, type BlockType } from "./blocks";
import { colorValues, type Cmyk, type Rgb } from "./color";
import type { Asset, Brand, ColorToken, FontFile, Section, StrategyField, TypeFamily, TypeStyle } from "./entities";
import { byPosition } from "./position";

/**
 * A published version is an immutable snapshot of the draft. The public guide,
 * downloads, brand.md and (later) the MCP server read only snapshots, so
 * drafting can never change what a client sees.
 */

export const SNAPSHOT_SCHEMA_VERSION = 1;

export type SnapshotBlock = {
  id: string;
  type: BlockType;
  props: Record<string, unknown>;
  layout: BlockLayout;
  children: SnapshotBlock[];
};

export type SnapshotSection = {
  id: string;
  title: string;
  slug: string;
  blocks: SnapshotBlock[];
  children: SnapshotSection[];
};

export type SnapshotColor = {
  id: string;
  name: string;
  group: ColorToken["group"];
  hex: string;
  rgb: Rgb;
  cmyk: Cmyk;
  cmykIsDerived: boolean;
  pantone: string | null;
};

export type SnapshotAsset = {
  id: string;
  name: string;
  category: Asset["category"];
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  storagePath: string;
  /** Shown in the guide's download area. Display-only assets are false. */
  downloadable: boolean;
};

export type GuideSnapshot = {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  brand: { id: string; name: string; slug: string; description: string | null };
  theme: { key: string; overrides: Record<string, unknown> };
  sections: SnapshotSection[];
  tokens: {
    colors: SnapshotColor[];
    typeFamilies: Array<Pick<TypeFamily, "id" | "name" | "source" | "role" | "fallback" | "downloadable"> & {
      files: Array<Pick<FontFile, "id" | "weight" | "style" | "assetId">>;
    }>;
    typeStyles: Array<Omit<TypeStyle, "brandId" | "position">>;
  };
  strategy: Partial<Record<StrategyField["key"], StrategyField["value"]>>;
  assets: SnapshotAsset[];
};

export type SnapshotInput = {
  brand: Pick<Brand, "id" | "name" | "slug" | "description">;
  theme?: { key: string; overrides?: Record<string, unknown> };
  sections: Section[];
  blocks: Block[];
  colors: ColorToken[];
  typeFamilies: TypeFamily[];
  fontFiles: FontFile[];
  typeStyles: TypeStyle[];
  strategy: StrategyField[];
  assets: Asset[];
};

export type SnapshotWarning = { blockId?: string; sectionId?: string; message: string };

export function buildSnapshot(input: SnapshotInput): { snapshot: GuideSnapshot; warnings: SnapshotWarning[] } {
  const warnings: SnapshotWarning[] = [];

  const colorIds = new Set(input.colors.map((c) => c.id));
  const styleIds = new Set(input.typeStyles.map((s) => s.id));
  const familyIds = new Set(input.typeFamilies.map((f) => f.id));
  const assetById = new Map(input.assets.map((a) => [a.id, a]));

  // Visible sections only: a hidden section hides its whole subtree.
  const sectionsByParent = groupBy(input.sections, (s) => s.parentId ?? "root");
  const visibleSectionIds = new Set<string>();
  const walk = (parentKey: string) => {
    for (const s of sectionsByParent.get(parentKey) ?? []) {
      if (s.hidden) continue;
      visibleSectionIds.add(s.id);
      walk(s.id);
    }
  };
  walk("root");

  const referencedAssetIds = new Set<string>();

  // Blocks in visible sections, validated, with dangling references removed.
  const cleanBlocks: Block[] = [];
  for (const block of input.blocks) {
    if (!visibleSectionIds.has(block.sectionId)) continue;
    const parsed = safeParseBlockProps(block.type, block.props);
    if (!parsed.success) {
      warnings.push({ blockId: block.id, message: `Skipped ${block.type} block with invalid content` });
      continue;
    }
    const props = stripDanglingRefs(block.type, parsed.data as Record<string, unknown>, {
      colorIds,
      styleIds,
      familyIds,
      assetIds: new Set(assetById.keys()),
      onDrop: (what) => warnings.push({ blockId: block.id, message: `Removed a missing ${what} reference` }),
    });
    const refs = blockReferences(block.type, props);
    refs.assetIds.forEach((id) => referencedAssetIds.add(id));
    cleanBlocks.push({ ...block, props });
  }

  const blocksBySection = groupBy(cleanBlocks, (b) => `${b.sectionId}:${b.parentBlockId ?? "root"}`);
  const buildBlocks = (sectionId: string, parentBlockId: string | null): SnapshotBlock[] =>
    [...(blocksBySection.get(`${sectionId}:${parentBlockId ?? "root"}`) ?? [])].sort(byPosition).map((b) => ({
      id: b.id,
      type: b.type,
      props: b.props,
      layout: b.layout,
      children: buildBlocks(sectionId, b.id),
    }));

  const buildSections = (parentKey: string): SnapshotSection[] =>
    [...(sectionsByParent.get(parentKey) ?? [])]
      .filter((s) => visibleSectionIds.has(s.id))
      .sort(byPosition)
      .map((s) => ({
        id: s.id,
        title: s.title,
        slug: s.slug,
        blocks: buildBlocks(s.id, null),
        children: buildSections(s.id),
      }));

  const filesByFamily = groupBy(input.fontFiles, (f) => f.familyId);
  for (const family of input.typeFamilies) {
    for (const file of filesByFamily.get(family.id) ?? []) referencedAssetIds.add(file.assetId);
  }
  const downloadableFontAssets = new Set(
    input.typeFamilies.filter((f) => f.downloadable).flatMap((f) => (filesByFamily.get(f.id) ?? []).map((ff) => ff.assetId)),
  );

  // Assets: everything shown in the guide, plus everything the designer marked client-visible.
  const assets: SnapshotAsset[] = input.assets
    .filter((a) => a.clientVisible || referencedAssetIds.has(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      mime: a.mime,
      size: a.size,
      width: a.width,
      height: a.height,
      storagePath: a.storagePath,
      downloadable: a.category === "font" ? a.clientVisible && downloadableFontAssets.has(a.id) : a.clientVisible,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const strategy: GuideSnapshot["strategy"] = {};
  for (const field of input.strategy) {
    if (field.status === "approved") strategy[field.key] = field.value;
  }

  const snapshot: GuideSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    brand: {
      id: input.brand.id,
      name: input.brand.name,
      slug: input.brand.slug,
      description: input.brand.description,
    },
    theme: { key: input.theme?.key ?? "standard", overrides: input.theme?.overrides ?? {} },
    sections: buildSections("root"),
    tokens: {
      colors: [...input.colors].sort(byPosition).map((c) => {
        const v = colorValues(c.hex, c.cmykOverride);
        return {
          id: c.id,
          name: c.name,
          group: c.group,
          hex: v.hex,
          rgb: v.rgb,
          cmyk: v.cmyk,
          cmykIsDerived: v.cmykIsDerived,
          pantone: c.pantone,
        };
      }),
      typeFamilies: input.typeFamilies.map((f) => ({
        id: f.id,
        name: f.name,
        source: f.source,
        role: f.role,
        fallback: f.fallback,
        downloadable: f.downloadable,
        files: (filesByFamily.get(f.id) ?? []).map((ff) => ({ id: ff.id, weight: ff.weight, style: ff.style, assetId: ff.assetId })),
      })),
      typeStyles: [...input.typeStyles].sort(byPosition).map(({ brandId: _b, position: _p, ...rest }) => rest),
    },
    strategy,
    assets,
  };

  return { snapshot, warnings };
}

function stripDanglingRefs(
  type: BlockType,
  props: Record<string, unknown>,
  ctx: {
    colorIds: Set<string>;
    styleIds: Set<string>;
    familyIds: Set<string>;
    assetIds: Set<string>;
    onDrop: (what: string) => void;
  },
): Record<string, unknown> {
  const keep = (ids: string[], valid: Set<string>, what: string) =>
    ids.filter((id) => {
      const ok = valid.has(id);
      if (!ok) ctx.onDrop(what);
      return ok;
    });
  const one = (id: string | null, valid: Set<string>, what: string) => {
    if (id && !valid.has(id)) {
      ctx.onDrop(what);
      return null;
    }
    return id;
  };

  switch (type) {
    case "palette": {
      const p = parseBlockProps("palette", props);
      return { ...p, tokenIds: keep(p.tokenIds, ctx.colorIds, "colour") };
    }
    case "color_combinations": {
      const p = parseBlockProps("color_combinations", props);
      return {
        ...p,
        pairs: p.pairs.filter((pair) => {
          const ok = ctx.colorIds.has(pair.foregroundId) && ctx.colorIds.has(pair.backgroundId);
          if (!ok) ctx.onDrop("colour");
          return ok;
        }),
      };
    }
    case "type_specimen": {
      const p = parseBlockProps("type_specimen", props);
      return { ...p, styleIds: keep(p.styleIds, ctx.styleIds, "type style") };
    }
    case "type_family": {
      const p = parseBlockProps("type_family", props);
      return { ...p, familyId: one(p.familyId, ctx.familyIds, "typeface") };
    }
    case "image": {
      const p = parseBlockProps("image", props);
      return { ...p, assetId: one(p.assetId, ctx.assetIds, "asset"), background: one(p.background, ctx.colorIds, "colour") };
    }
    case "video": {
      const p = parseBlockProps("video", props);
      return { ...p, assetId: one(p.assetId, ctx.assetIds, "asset") };
    }
    case "gallery": {
      const p = parseBlockProps("gallery", props);
      return { ...p, assetIds: keep(p.assetIds, ctx.assetIds, "asset") };
    }
    case "file_download": {
      const p = parseBlockProps("file_download", props);
      return { ...p, assetIds: keep(p.assetIds, ctx.assetIds, "asset") };
    }
    case "dos_donts": {
      const p = parseBlockProps("dos_donts", props);
      return { ...p, items: p.items.map((i) => ({ ...i, assetId: one(i.assetId, ctx.assetIds, "asset") })) };
    }
    default:
      return props;
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
