import { describe, expect, it } from "vitest";
import type { Block } from "./blocks";
import type { Asset, ColorToken, Section } from "./entities";
import { buildSnapshot, type SnapshotInput } from "./snapshot";

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const BRAND = uuid(1);

const section = (n: number, title: string, position: number, extra: Partial<Section> = {}): Section => ({
  id: uuid(n),
  brandId: BRAND,
  parentId: null,
  title,
  slug: title.toLowerCase(),
  position,
  hidden: false,
  templateKey: null,
  ...extra,
});

const block = (n: number, sectionN: number, type: Block["type"], props: Record<string, unknown>, position = 1024): Block => ({
  id: uuid(n),
  sectionId: uuid(sectionN),
  parentBlockId: null,
  type,
  position,
  props,
  layout: { width: "wide", span: 1 },
  origin: "manual",
  schemaVersion: 1,
});

const color = (n: number, name: string, hex: string, position: number): ColorToken => ({
  id: uuid(n),
  brandId: BRAND,
  name,
  hex,
  cmykOverride: null,
  pantone: null,
  group: "primary",
  position,
});

const asset = (n: number, name: string, extra: Partial<Asset> = {}): Asset => ({
  id: uuid(n),
  brandId: BRAND,
  category: "logo",
  name,
  storagePath: `${BRAND}/${name}`,
  mime: "image/svg+xml",
  size: 100,
  width: null,
  height: null,
  clientVisible: false,
  ...extra,
});

function baseInput(): SnapshotInput {
  return {
    brand: { id: BRAND, name: "Osan Kitchen", slug: "osan-kitchen", description: null },
    sections: [
      section(10, "Colour", 2048),
      section(11, "Logo", 1024),
      section(12, "Motion", 3072, { hidden: true }),
      section(13, "Logo animation", 1024, { parentId: uuid(12) }),
    ],
    blocks: [
      block(20, 10, "palette", { tokenIds: [uuid(31), uuid(30), uuid(99)] }),
      block(21, 11, "image", { assetId: uuid(40) }),
      block(22, 13, "video", { assetId: uuid(41) }),
      block(23, 10, "palette", { tokenIds: "broken" }, 2048),
    ],
    colors: [color(30, "Pepper Red", "#c8402b", 1024), color(31, "Ink", "#1b1b1b", 2048)],
    typeFamilies: [],
    fontFiles: [],
    typeStyles: [],
    strategy: [
      { brandId: BRAND, key: "mission", value: "Feed people well.", status: "approved", source: "manual" },
      { brandId: BRAND, key: "vision", value: "Not ready.", status: "draft", source: "ai" },
    ],
    assets: [
      asset(40, "logo.svg"),
      asset(41, "intro.mp4", { category: "video" }),
      asset(42, "logo-pack.zip", { clientVisible: true }),
      asset(43, "internal-notes.pdf"),
    ],
  };
}

describe("buildSnapshot", () => {
  it("orders sections by position and drops hidden subtrees", () => {
    const { snapshot } = buildSnapshot(baseInput());
    expect(snapshot.sections.map((s) => s.title)).toEqual(["Logo", "Colour"]);
  });

  it("drops invalid blocks and dangling references with warnings", () => {
    const { snapshot, warnings } = buildSnapshot(baseInput());
    const colour = snapshot.sections.find((s) => s.title === "Colour")!;
    expect(colour.blocks).toHaveLength(1);
    expect(colour.blocks[0]!.props.tokenIds).toEqual([uuid(31), uuid(30)]);
    expect(warnings.map((w) => w.message)).toEqual(
      expect.arrayContaining(["Removed a missing colour reference", "Skipped palette block with invalid content"]),
    );
  });

  it("resolves colour tokens with normalised hex and derived values", () => {
    const { snapshot } = buildSnapshot(baseInput());
    expect(snapshot.tokens.colors[0]).toMatchObject({
      name: "Pepper Red",
      hex: "#C8402B",
      rgb: { r: 200, g: 64, b: 43 },
      cmykIsDerived: true,
    });
  });

  it("publishes only approved strategy", () => {
    const { snapshot } = buildSnapshot(baseInput());
    expect(snapshot.strategy).toEqual({ mission: "Feed people well." });
  });

  it("includes shown and client-visible assets, never private unreferenced ones", () => {
    const { snapshot } = buildSnapshot(baseInput());
    const byName = Object.fromEntries(snapshot.assets.map((a) => [a.name, a.downloadable]));
    expect(byName).toEqual({ "logo.svg": false, "logo-pack.zip": true });
    expect(byName).not.toHaveProperty("intro.mp4"); // only used in a hidden section
    expect(byName).not.toHaveProperty("internal-notes.pdf");
  });

  it("only offers font files for download when the licence allows it", () => {
    const input = baseInput();
    input.assets.push(asset(50, "Fraunces.woff2", { category: "font", clientVisible: true }));
    input.typeFamilies = [
      {
        id: uuid(60),
        brandId: BRAND,
        name: "Fraunces",
        source: "upload",
        role: "primary",
        fallback: "Georgia, serif",
        licenceNote: null,
        downloadable: false,
      },
    ];
    input.fontFiles = [{ id: uuid(61), familyId: uuid(60), weight: 600, style: "normal", assetId: uuid(50) }];
    const font = buildSnapshot(input).snapshot.assets.find((a) => a.name === "Fraunces.woff2");
    expect(font?.downloadable).toBe(false);

    input.typeFamilies[0]!.downloadable = true;
    expect(buildSnapshot(input).snapshot.assets.find((a) => a.name === "Fraunces.woff2")?.downloadable).toBe(true);
  });

  it("is plain JSON (safe to store and serve)", () => {
    const { snapshot } = buildSnapshot(baseInput());
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
