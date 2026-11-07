import { describe, expect, it } from "vitest";
import { addFamily } from "./brand-system";
import {
  addAsset,
  addFontFile,
  assetUsage,
  deleteAsset,
  deleteFontFile,
  guessCategory,
  guessFontWeight,
  safeFileName,
  storagePathFor,
  updateAsset,
} from "./assets";
import { addBlock, addSection, type AssetRow, type Draft } from "./model";

const ids = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`;
};
const empty = (): Draft => ({ sections: {}, blocks: {}, strategy: {}, colors: {}, families: {}, styles: {}, assets: {}, fontFiles: {} });
const asset = (id: string, extra: Partial<AssetRow> = {}): AssetRow => ({
  id,
  category: "logo",
  name: "logo.svg",
  storage_path: `brand/${id}/logo.svg`,
  mime: "image/svg+xml",
  size: 1200,
  width: 200,
  height: 80,
  client_visible: false,
  ...extra,
});

describe("file names and categories", () => {
  it("makes storage-safe names that keep the extension", () => {
    expect(safeFileName("Ọsán Logo (final) v2.SVG")).toBe("Osan-Logo-final-v2.svg");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(storagePathFor("b1", "a1", "my logo.png")).toBe("b1/a1/my-logo.png");
  });

  it("guesses categories from type and name", () => {
    expect(guessCategory({ type: "image/svg+xml", name: "osan-logo.svg" })).toBe("logo");
    expect(guessCategory({ type: "image/jpeg", name: "market.jpg" })).toBe("photography");
    expect(guessCategory({ type: "", name: "Fraunces-Bold.woff2" })).toBe("font");
    expect(guessCategory({ type: "video/mp4", name: "intro.mp4" })).toBe("video");
    expect(guessCategory({ type: "application/pdf", name: "brand.pdf" })).toBe("other");
  });

  it("guesses font weight and style from file names", () => {
    expect(guessFontWeight("Fraunces-SemiBoldItalic.woff2")).toEqual({ weight: 600, style: "italic" });
    expect(guessFontWeight("DMSans-Bold.ttf")).toEqual({ weight: 700, style: "normal" });
    expect(guessFontWeight("Inter-ExtraLight.otf")).toEqual({ weight: 200, style: "normal" });
    expect(guessFontWeight("Brand-Regular.woff")).toEqual({ weight: 400, style: "normal" });
  });
});

describe("asset commands", () => {
  it("adds and updates assets with patch-only ops", () => {
    const d = addAsset(empty(), asset("a1")).draft;
    const r = updateAsset(d, "a1", { client_visible: true, name: "  " });
    expect(r.draft.assets.a1).toMatchObject({ client_visible: true, name: "logo.svg" });
    expect(r.ops[0]!.row).toEqual({ id: "a1", client_visible: true, name: "logo.svg" });
  });

  it("deleting an asset clears it from every block type that used it", () => {
    const newId = ids();
    // Use real ids in props so the block props validate.
    const A1 = "11111111-1111-4111-8111-111111111111";
    const A2 = "22222222-2222-4222-8222-222222222222";
    let d = addAsset(empty(), asset(A1)).draft;
    d = addAsset(d, asset(A2)).draft;
    const sec = addSection(d, null, "Logo", newId);
    d = sec.draft;
    const img = addBlock(d, sec.created!, "image", null, { assetId: A1 }, newId);
    const gal = addBlock(img.draft, sec.created!, "gallery", null, { assetIds: [A1, A2] }, newId);
    const dl = addBlock(gal.draft, sec.created!, "file_download", null, { assetIds: [A1] }, newId);
    const dd = addBlock(dl.draft, sec.created!, "dos_donts", null, { items: [{ assetId: A1, kind: "dont", note: "Don't stretch" }] }, newId);
    expect(assetUsage(dd.draft, A1)).toBe(4);

    const r = deleteAsset(dd.draft, A1);
    expect(r.draft.assets[A1]).toBeUndefined();
    expect(r.draft.blocks[img.created!]!.props.assetId).toBeNull();
    expect(r.draft.blocks[gal.created!]!.props.assetIds).toEqual([A2]);
    expect(r.draft.blocks[dl.created!]!.props.assetIds).toEqual([]);
    expect((r.draft.blocks[dd.created!]!.props.items as Array<{ assetId: string | null; note: string }>)[0]).toEqual({
      assetId: null,
      kind: "dont",
      note: "Don't stretch",
    });
    expect(r.ops.at(-1)).toEqual({ op: "delete", table: "assets", row: { id: A1 } });
  });
});

describe("font files", () => {
  it("attaches files to a typeface, one per weight and style", () => {
    const newId = ids();
    const f = addFamily(empty(), { name: "Brand Sans", source: "upload" }, newId);
    let d = addAsset(f.draft, asset("ff1", { category: "font", name: "BrandSans-Bold.woff2", mime: "font/woff2" })).draft;
    d = addAsset(d, asset("ff2", { category: "font", name: "BrandSans-Bold2.woff2", mime: "font/woff2" })).draft;
    const a = addFontFile(d, { family_id: f.created!, asset_id: "ff1", weight: 700, style: "normal" }, newId);
    expect(a.error).toBeUndefined();
    expect(addFontFile(a.draft, { family_id: f.created!, asset_id: "ff2", weight: 700, style: "normal" }).error).toMatch(/already/);
    expect(deleteFontFile(a.draft, a.created!).draft.fontFiles).toEqual({});
  });

  it("deleting a font asset drops its font file and pending changes", () => {
    const newId = ids();
    const f = addFamily(empty(), { name: "Brand Sans", source: "upload" }, newId);
    const d = addAsset(f.draft, asset("ff1", { category: "font", mime: "font/woff2" })).draft;
    const a = addFontFile(d, { family_id: f.created!, asset_id: "ff1", weight: 400, style: "normal" }, newId);
    const r = deleteAsset(a.draft, "ff1");
    expect(r.draft.fontFiles).toEqual({});
    expect(r.drop).toEqual([`font_files:${a.created}`]);
  });
});
