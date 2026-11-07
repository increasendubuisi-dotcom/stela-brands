import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { Editor } from "@/editor/editor";
import type { BlockRow, Draft, SectionRow, StrategyRow } from "@/editor/model";

export const metadata: Metadata = { title: "Editor" };

export default async function BrandEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireUser();

  const { data: brand } = await supabase.from("brands").select("id, name, status, draft_rev").eq("id", id).maybeSingle();
  if (!brand) notFound();

  const [sections, blocks, strategy] = await Promise.all([
    supabase.from("sections").select("id, parent_id, title, slug, position, hidden, template_key").eq("brand_id", id),
    supabase.from("blocks").select("id, section_id, parent_block_id, type, position, props, layout").eq("brand_id", id),
    supabase.from("strategy_fields").select("key, value, status, source").eq("brand_id", id),
  ]);
  const failed = sections.error ?? blocks.error ?? strategy.error;
  if (failed) throw new Error(`Could not load this guide: ${failed.message}`);

  const draft: Draft = {
    sections: Object.fromEntries((sections.data as SectionRow[]).map((s) => [s.id, s])),
    blocks: Object.fromEntries((blocks.data as BlockRow[]).map((b) => [b.id, b])),
    strategy: Object.fromEntries((strategy.data as StrategyRow[]).map((s) => [s.key, s])),
  };

  return <Editor brand={{ id: brand.id, name: brand.name, status: brand.status }} initial={draft} rev={Number(brand.draft_rev)} />;
}
