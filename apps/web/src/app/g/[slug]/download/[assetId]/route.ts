import { NextResponse, type NextRequest } from "next/server";
import { canSignFiles, loadPublishedGuide, signGuideAssets } from "@/lib/guide";

// One file from a published guide. Only files the published version marks as
// downloadable can be fetched, and only by someone who can see the guide.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; assetId: string }> }) {
  const { slug, assetId } = await params;
  const guide = await loadPublishedGuide(slug);
  if (guide.kind !== "ok") return new NextResponse("Not found", { status: 404 });
  const asset = guide.snapshot.assets.find((a) => a.id === assetId && a.downloadable);
  if (!asset) return new NextResponse("Not found", { status: 404 });
  if (!canSignFiles()) return new NextResponse("Downloads are not available yet.", { status: 503 });
  const urls = await signGuideAssets(guide.snapshot, [asset.id], true);
  const url = urls[asset.id];
  if (!url) return new NextResponse("File unavailable", { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
