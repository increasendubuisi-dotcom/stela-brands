import { describe, expect, it } from "vitest";
import {
  addColor,
  addFamily,
  addStandardScale,
  addStyle,
  allColors,
  colorUsage,
  deleteColor,
  deleteFamily,
  deleteStyle,
  familyCss,
  moveColor,
  updateColor,
  updateStyle,
  weightsByFamily,
} from "./brand-system";
import { extractColors } from "./extract-colors";
import { addBlock, addSection, type Draft } from "./model";

const ids = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`;
};
const empty = (): Draft => ({ sections: {}, blocks: {}, strategy: {}, colors: {}, families: {}, styles: {}, assets: {}, fontFiles: {} });

describe("colours", () => {
  it("normalises hex and keeps names unique", () => {
    const newId = ids();
    let d = addColor(empty(), { name: "Pepper Red", hex: "c8402b" }, newId).draft;
    const r = addColor(d, { name: "pepper red", hex: "#abc" }, newId);
    d = r.draft;
    expect(allColors(d).map((c) => [c.name, c.hex])).toEqual([
      ["Pepper Red", "#C8402B"],
      ["pepper red 2", "#AABBCC"],
    ]);
  });

  it("refuses invalid hex without changing anything", () => {
    const d = empty();
    const r = addColor(d, { name: "Bad", hex: "red" });
    expect(r.error).toMatch(/valid hex/);
    expect(r.ops).toEqual([]);
    expect(r.draft).toBe(d);
  });

  it("edits only what changed and clamps CMYK overrides", () => {
    const newId = ids();
    const a = addColor(empty(), { name: "Ink", hex: "#111111" }, newId);
    const r = updateColor(a.draft, a.created!, { hex: "#1b1b1b", cmyk_override: { c: 0, m: 0, y: 0, k: 140 } });
    expect(r.ops[0]!.row).toEqual({ id: a.created, hex: "#1B1B1B", cmyk_override: { c: 0, m: 0, y: 0, k: 100 } });
  });

  it("moves a colour to the end of its new group", () => {
    const newId = ids();
    let d = addColor(empty(), { name: "A", hex: "#000000", group: "secondary" }, newId).draft;
    const b = addColor(d, { name: "B", hex: "#111111" }, newId);
    d = updateColor(b.draft, b.created!, { color_group: "secondary" }).draft;
    expect(allColors(d).map((c) => c.name)).toEqual(["A", "B"]);
  });

  it("reorders within a group", () => {
    const newId = ids();
    let d = addColor(empty(), { name: "A", hex: "#000000" }, newId).draft;
    const b = addColor(d, { name: "B", hex: "#111111" }, newId);
    d = moveColor(b.draft, b.created!, -1).draft;
    expect(allColors(d).map((c) => c.name)).toEqual(["B", "A"]);
  });

  it("deleting a colour removes it from palettes and combinations in the same save", () => {
    const newId = ids();
    const s = addSection(empty(), null, "Colour", newId);
    const red = addColor(s.draft, { name: "Red", hex: "#ff0000" }, newId);
    const ink = addColor(red.draft, { name: "Ink", hex: "#111111" }, newId);
    const pal = addBlock(ink.draft, s.created!, "palette", null, { tokenIds: [red.created, ink.created] }, newId);
    const combo = addBlock(pal.draft, s.created!, "color_combinations", null, {
      pairs: [{ foregroundId: ink.created, backgroundId: red.created }],
    }, newId);
    expect(colorUsage(combo.draft, red.created!)).toBe(2);

    const r = deleteColor(combo.draft, red.created!);
    expect(r.draft.colors[red.created!]).toBeUndefined();
    expect(r.draft.blocks[pal.created!]!.props.tokenIds).toEqual([ink.created]);
    expect(r.draft.blocks[combo.created!]!.props.pairs).toEqual([]);
    // Block updates first, the delete last.
    expect(r.ops.map((o) => `${o.op}:${o.table}`)).toEqual(["upsert:blocks", "upsert:blocks", "delete:color_tokens"]);
  });
});

describe("typography", () => {
  it("adds typefaces with a role and a sensible fallback, refusing duplicates", () => {
    const newId = ids();
    const a = addFamily(empty(), { name: "Fraunces" }, newId);
    const b = addFamily(a.draft, { name: "DM Sans" }, newId);
    expect(a.draft.families[a.created!]).toMatchObject({ role: "primary", fallback: "Georgia, serif" });
    expect(b.draft.families[b.created!]).toMatchObject({ role: "secondary", fallback: "system-ui, sans-serif" });
    expect(addFamily(b.draft, { name: "fraunces" }).error).toMatch(/already/);
    expect(familyCss(b.draft.families[b.created!])).toBe('"DM Sans", system-ui, sans-serif');
    expect(familyCss({ name: 'Evil"}</style><script>', fallback: "serif; } body {" })).toBe('"Evilstylescript", serif  body');
  });

  it("builds a standard scale and loads the weights it uses", () => {
    const newId = ids();
    const a = addFamily(empty(), { name: "Fraunces" }, newId);
    const b = addFamily(a.draft, { name: "DM Sans" }, newId);
    const r = addStandardScale(b.draft, a.created!, b.created!, newId);
    expect(Object.values(r.draft.styles).map((s) => s.name)).toEqual(["Display", "Heading 1", "Heading 2", "Body", "Caption"]);
    expect(weightsByFamily(r.draft).get(a.created!)).toEqual([400, 600]);
    expect(weightsByFamily(r.draft).get(b.created!)).toEqual([400, 500]);
  });

  it("clamps style values to what the database accepts", () => {
    const newId = ids();
    const f = addFamily(empty(), { name: "Inter" }, newId);
    const s = addStyle(f.draft, { name: "Body", family_id: f.created!, weight: 450, size: 16.333, line_height: 9, tracking: 2, text_transform: "none" }, newId);
    expect(s.draft.styles[s.created!]).toMatchObject({ weight: 500, size: 16.33, line_height: 4, tracking: 1 });
    expect(updateStyle(s.draft, s.created!, { weight: 30 }).ops[0]!.row).toEqual({ id: s.created, weight: 100 });
  });

  it("won't delete a typeface that styles still use", () => {
    const newId = ids();
    const f = addFamily(empty(), { name: "Inter" }, newId);
    const s = addStyle(f.draft, { name: "Body", family_id: f.created!, weight: 400, size: 16, line_height: 1.5, tracking: 0, text_transform: "none" }, newId);
    const r = deleteFamily(s.draft, f.created!);
    expect(r.error).toMatch(/Body/);
    expect(r.ops).toEqual([]);
    expect(deleteFamily(deleteStyle(s.draft, s.created!).draft, f.created!).error).toBeUndefined();
  });

  it("deleting a style removes it from specimens", () => {
    const newId = ids();
    const sec = addSection(empty(), null, "Type", newId);
    const f = addFamily(sec.draft, { name: "Inter" }, newId);
    const s = addStyle(f.draft, { name: "Body", family_id: f.created!, weight: 400, size: 16, line_height: 1.5, tracking: 0, text_transform: "none" }, newId);
    const spec = addBlock(s.draft, sec.created!, "type_specimen", null, { styleIds: [s.created] }, newId);
    const r = deleteStyle(spec.draft, s.created!);
    expect(r.draft.blocks[spec.created!]!.props.styleIds).toEqual([]);
  });
});

describe("extractColors", () => {
  const image = (parts: Array<[number, [number, number, number, number]]>) => {
    const px: number[] = [];
    for (const [count, rgba] of parts) for (let i = 0; i < count; i++) px.push(...rgba);
    return new Uint8ClampedArray(px);
  };

  it("finds flat logo colours in order of coverage and ignores transparency", () => {
    const px = image([
      [600, [200, 64, 43, 255]],
      [300, [27, 27, 27, 255]],
      [100, [243, 237, 227, 255]],
      [2000, [0, 0, 0, 0]],
    ]);
    expect(extractColors(px).map((c) => c.hex)).toEqual(["#C8402B", "#1B1B1B", "#F3EDE3"]);
  });

  it("merges near-identical shades from anti-aliasing", () => {
    const px = image([
      [500, [200, 64, 43, 255]],
      [40, [205, 70, 48, 255]],
      [300, [20, 40, 160, 255]],
    ]);
    const out = extractColors(px);
    expect(out).toHaveLength(2);
    expect(out[0]!.share).toBeGreaterThan(0.6);
  });

  it("returns nothing for a fully transparent image", () => {
    expect(extractColors(image([[100, [255, 255, 255, 0]]]))).toEqual([]);
  });
});
