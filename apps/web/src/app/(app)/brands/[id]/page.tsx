import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { Editor } from "@/editor/editor";
import type { BlockRow, ColorRow, Draft, FamilyRow, SectionRow, StrategyRow, StyleRow } from "@/editor/model";

export const metadata: Metadata = { title: "Editor" };

const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.id, r]));

export default async function BrandEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireUser();

  const { data: brand } = await supabase.from("brands").select("id, name, status, draft_rev").eq("id", id).maybeSingle();
  if (!brand) notFound();

  const [sections, blocks, strategy, colors, families, styles] = await Promise.all([
    supabase.from("sections").select("id, parent_id, title, slug, position, hidden, template_key").eq("brand_id", id),
    supabase.from("blocks").select("id, section_id, parent_block_id, type, position, props, layout").eq("brand_id", id),
    supabase.from("strategy_fields").select("key, value, status, source").eq("brand_id", id),
    supabase.from("color_tokens").select("id, name, hex, cmyk_override, pantone, color_group, position").eq("brand_id", id),
    supabase.from("type_families").select("id, name, source, role, fallback, licence_note, downloadable").eq("brand_id", id),
    supabase.from("type_styles").select("id, name, family_id, weight, size, line_height, tracking, text_transform, position").eq("brand_id", id),
  ]);
  const failed = [sections, blocks, strategy, colors, families, styles].find((r) => r.error)?.error;
  if (failed) throw new Error(`Could not load this guide: ${failed.message}`);

  const draft: Draft = {
    sections: byId(sections.data as SectionRow[]),
    blocks: byId(blocks.data as BlockRow[]),
    strategy: Object.fromEntries((strategy.data as StrategyRow[]).map((s) => [s.key, s])),
    colors: byId(colors.data as ColorRow[]),
    families: byId(families.data as FamilyRow[]),
    // Postgres numeric columns can arrive as strings; the editor works in numbers.
    styles: byId(
      (styles.data as StyleRow[]).map((s) => ({
        ...s,
        size: Number(s.size),
        line_height: Number(s.line_height),
        tracking: Number(s.tracking),
      })),
    ),
  };

  return <Editor brand={{ id: brand.id, name: brand.name, status: brand.status }} initial={draft} rev={Number(brand.draft_rev)} />;
}
