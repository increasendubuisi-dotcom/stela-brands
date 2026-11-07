import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Brand" };

type SectionRow = { id: string; parent_id: string | null; title: string; position: number; hidden: boolean };

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireUser();

  const { data: brand } = await supabase.from("brands").select("id, name, slug, description, status, draft_rev").eq("id", id).maybeSingle();
  if (!brand) notFound();

  const [{ data: sections }, { count: blockCount }] = await Promise.all([
    supabase.from("sections").select("id, parent_id, title, position, hidden").eq("brand_id", id).order("position"),
    supabase.from("blocks").select("id", { count: "exact", head: true }).eq("brand_id", id),
  ]);

  const rows = (sections ?? []) as SectionRow[];
  const top = rows.filter((s) => !s.parent_id);
  const childrenOf = (pid: string) => rows.filter((s) => s.parent_id === pid);

  return (
    <main className="mx-auto max-w-[900px] px-6 py-12 md:px-8">
      <Link href="/dashboard" className="text-sm text-muted no-underline hover:text-ink">
        ← Brands
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-5xl leading-none">{brand.name}</h1>
        <span className="rounded-full bg-[#f0eee8] px-2 py-0.5 text-xs capitalize text-muted">{brand.status}</span>
      </div>
      {brand.description ? <p className="mt-3 max-w-xl text-[15px] text-muted">{brand.description}</p> : null}

      <div className="mt-8 rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft p-4 text-sm">
        The guide structure below is saved. The editor for sections and blocks is the next part being built.
      </div>

      <section className="mt-8" aria-labelledby="structure">
        <h2 id="structure" className="text-sm font-semibold">
          Guide structure <span className="font-normal text-muted">· {rows.length} sections, {blockCount ?? 0} blocks</span>
        </h2>
        <ol className="mt-3 flex flex-col gap-1">
          {top.map((s, i) => (
            <li key={s.id} className="rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3">
              <span className="mr-3 text-subtle">{String(i + 1).padStart(2, "0")}</span>
              <span className="font-medium">{s.title}</span>
              {childrenOf(s.id).length ? (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-8 text-[13px] text-muted">
                  {childrenOf(s.id).map((c) => (
                    <li key={c.id}>{c.title}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
