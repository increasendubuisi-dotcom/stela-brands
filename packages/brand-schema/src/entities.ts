import { z } from "zod";
import { isValidHex, normalizeHex } from "./color";

/** Database ids are UUIDs. */
export const Id = z.uuid();

export const CmykSchema = z.object({
  c: z.number().int().min(0).max(100),
  m: z.number().int().min(0).max(100),
  y: z.number().int().min(0).max(100),
  k: z.number().int().min(0).max(100),
});

export const HexColor = z
  .string()
  .refine(isValidHex, { message: "Enter a hex colour like #C8402B" })
  .transform((v) => normalizeHex(v));

export const BrandStatus = z.enum(["draft", "published", "archived"]);
export const Visibility = z.enum(["public", "password", "unpublished"]);
export const WorkspaceRole = z.enum(["owner", "admin", "editor", "viewer"]);

export const Brand = z.object({
  id: Id,
  workspaceId: Id,
  name: z.string().trim().min(1, "Name is required").max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, "Use lowercase letters, numbers and dashes"),
  description: z.string().max(500).nullable(),
  websiteUrl: z.url().nullable(),
  status: BrandStatus,
  currentVersionId: Id.nullable(),
});
export type Brand = z.infer<typeof Brand>;

export const Section = z.object({
  id: Id,
  brandId: Id,
  parentId: Id.nullable(),
  title: z.string().trim().min(1).max(120),
  slug: z.string().min(1).max(140),
  position: z.number(),
  hidden: z.boolean(),
  templateKey: z.string().nullable(),
});
export type Section = z.infer<typeof Section>;

export const ColorGroup = z.enum(["primary", "secondary", "supporting"]);

export const ColorToken = z.object({
  id: Id,
  brandId: Id,
  name: z.string().trim().min(1).max(60),
  hex: HexColor,
  cmykOverride: CmykSchema.nullable(),
  pantone: z.string().max(40).nullable(),
  group: ColorGroup,
  position: z.number(),
});
export type ColorToken = z.infer<typeof ColorToken>;

export const TypeRole = z.enum(["primary", "secondary", "other"]);
export const FontSource = z.enum(["upload", "google", "system"]);

export const TypeFamily = z.object({
  id: Id,
  brandId: Id,
  name: z.string().trim().min(1).max(80),
  source: FontSource,
  role: TypeRole,
  /** CSS fallback stack appended after the family, e.g. "Georgia, serif". */
  fallback: z.string().max(120),
  licenceNote: z.string().max(500).nullable(),
  /** Designer confirms the licence allows clients to download these files. */
  downloadable: z.boolean(),
});
export type TypeFamily = z.infer<typeof TypeFamily>;

export const FontFile = z.object({
  id: Id,
  familyId: Id,
  weight: z.number().int().min(100).max(900),
  style: z.enum(["normal", "italic"]),
  assetId: Id,
});
export type FontFile = z.infer<typeof FontFile>;

export const TypeStyle = z.object({
  id: Id,
  brandId: Id,
  name: z.string().trim().min(1).max(40),
  familyId: Id,
  weight: z.number().int().min(100).max(900),
  /** px */
  size: z.number().positive().max(400),
  lineHeight: z.number().positive().max(4),
  /** em */
  tracking: z.number().min(-0.5).max(1),
  textTransform: z.enum(["none", "uppercase"]),
  position: z.number(),
});
export type TypeStyle = z.infer<typeof TypeStyle>;

export const AssetCategory = z.enum([
  "logo",
  "font",
  "illustration",
  "pattern",
  "icon",
  "photography",
  "video",
  "mockup",
  "other",
]);

export const Asset = z.object({
  id: Id,
  brandId: Id,
  category: AssetCategory,
  name: z.string().min(1).max(200),
  storagePath: z.string().min(1),
  mime: z.string().min(1),
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  clientVisible: z.boolean(),
});
export type Asset = z.infer<typeof Asset>;

/** Strategy fields the template, editor blocks and (Phase 2) the AI all share. */
export const STRATEGY_FIELD_KEYS = [
  "overview",
  "story",
  "mission",
  "vision",
  "purpose",
  "values",
  "positioning",
  "audience",
  "personality",
  "archetype",
  "promise",
  "messaging",
  "tone",
] as const;
export const StrategyFieldKey = z.enum(STRATEGY_FIELD_KEYS);
export type StrategyFieldKey = z.infer<typeof StrategyFieldKey>;

export const StrategyField = z.object({
  brandId: Id,
  key: StrategyFieldKey,
  /** Plain text, or a list for values/personality. */
  value: z.union([z.string().max(4000), z.array(z.object({ title: z.string().max(120), body: z.string().max(1000) })).max(20)]),
  status: z.enum(["draft", "approved"]),
  source: z.enum(["manual", "ai"]),
});
export type StrategyField = z.infer<typeof StrategyField>;
