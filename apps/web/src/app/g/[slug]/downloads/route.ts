import { NextResponse, type NextRequest } from "next/server";
import { canSignFiles, loadPublishedGuide, signGuideAssets } from "@/lib/guide";

// Short-lived links for every downloadable file, used by "Download all" to zip in the browser.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = await loadPublishedGuide(slug);
  if (guide.kind !== "ok") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canSignFiles()) return NextResponse.json({ error: "Downloads are not available yet." }, { status: 503 });
  const files = guide.snapshot.assets.filter((a) => a.downloadable);
  const urls = await signGuideAssets(guide.snapshot, files.map((f) => f.id));
  return NextResponse.json(
    files.filter((f) => urls[f.id]).map((f) => ({ name: f.name, url: urls[f.id] })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
