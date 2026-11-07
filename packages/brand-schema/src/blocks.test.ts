import { describe, expect, it } from "vitest";
import { BLOCK_TYPES, blockReferences, defaultBlockProps, parseBlockProps, safeParseBlockProps } from "./blocks";
import { TEMPLATES, slugify, type TemplateSection } from "./templates";

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

describe("block props", () => {
  it("fills defaults for every block type except strategy_field", () => {
    for (const type of BLOCK_TYPES) {
      if (type === "strategy_field") continue;
      expect(() => defaultBlockProps(type)).not.toThrow();
    }
  });

  it("requires a field key on strategy blocks", () => {
    expect(safeParseBlockProps("strategy_field", {}).success).toBe(false);
    expect(parseBlockProps("strategy_field", { fieldKey: "mission" })).toEqual({ fieldKey: "mission", display: "body" });
  });

  it("rejects unknown types and bad references", () => {
    expect(safeParseBlockProps("carousel", {}).success).toBe(false);
    expect(safeParseBlockProps("palette", { tokenIds: ["not-a-uuid"] }).success).toBe(false);
  });

  it("palette stores token ids, never colour values", () => {
    const props = parseBlockProps("palette", { tokenIds: [uuid(1)] });
    expect(JSON.stringify(props)).not.toMatch(/#[0-9A-F]{6}/i);
  });

  it("collects references for downloads and validation", () => {
    expect(blockReferences("image", { assetId: uuid(1), background: uuid(2) })).toEqual({
      assetIds: [uuid(1)],
      colorTokenIds: [uuid(2)],
      typeStyleIds: [],
      typeFamilyIds: [],
    });
    expect(
      blockReferences("color_combinations", { pairs: [{ foregroundId: uuid(3), backgroundId: uuid(4) }] }).colorTokenIds,
    ).toEqual([uuid(3), uuid(4)]);
  });
});

describe("templates", () => {
  const collect = (sections: TemplateSection[]): TemplateSection[] =>
    sections.flatMap((s) => [s, ...collect(s.children ?? [])]);

  it("every template block has valid props", () => {
    for (const template of Object.values(TEMPLATES)) {
      for (const section of collect(template.sections)) {
        for (const block of section.blocks ?? []) {
          const result = safeParseBlockProps(block.type, block.props ?? {});
          expect(result.success, `${template.key}/${section.key}/${block.type}`).toBe(true);
        }
      }
    }
  });

  it("template keys are unique within a template", () => {
    for (const template of Object.values(TEMPLATES)) {
      const keys = collect(template.sections).map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("complete template covers all nine categories from the brief", () => {
    expect(TEMPLATES.complete!.sections.map((s) => s.title)).toEqual([
      "Brand strategy",
      "Logo system",
      "Colour",
      "Typography",
      "Visual identity",
      "Photography and imagery",
      "Motion",
      "Verbal identity",
      "Applications",
    ]);
  });
});

describe("slugify", () => {
  it("makes url-safe slugs", () => {
    expect(slugify("Photography do's & don'ts")).toBe("photography-do-s-and-don-ts");
    expect(slugify("Ọ̀sán Kitchen")).toBe("osan-kitchen");
    expect(slugify("!!!")).toBe("section");
  });
});
