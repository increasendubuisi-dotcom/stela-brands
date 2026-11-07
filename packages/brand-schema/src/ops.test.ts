import { describe, expect, it } from "vitest";
import { safeParseBlockProps } from "./blocks";
import { MAX_OPS_PER_SAVE, templateToOps } from "./ops";
import { TEMPLATES } from "./templates";

const counter = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`;
};

describe("templateToOps", () => {
  for (const template of Object.values(TEMPLATES)) {
    it(`${template.key}: fits in one save, valid blocks, parents first`, () => {
      const ops = templateToOps(template, counter());
      expect(ops.length).toBeLessThanOrEqual(MAX_OPS_PER_SAVE);

      const created = new Set<string>();
      for (const op of ops) {
        if (op.table === "sections") {
          const parent = op.row.parent_id as string | null;
          if (parent) expect(created.has(parent)).toBe(true);
          created.add(op.row.id as string);
        } else {
          expect(op.table).toBe("blocks");
          expect(created.has(op.row.section_id as string)).toBe(true);
          expect(safeParseBlockProps(op.row.type as string, op.row.props).success).toBe(true);
        }
      }
    });
  }

  it("gives every section a unique slug", () => {
    const ops = templateToOps(TEMPLATES.complete!, counter()).filter((o) => o.table === "sections");
    const slugs = ops.map((o) => o.row.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("creates the complete template's 9 top-level sections in order", () => {
    const top = templateToOps(TEMPLATES.complete!, counter()).filter((o) => o.table === "sections" && o.row.parent_id === null);
    expect(top.map((o) => o.row.title)).toEqual(TEMPLATES.complete!.sections.map((s) => s.title));
    const positions = top.map((o) => o.row.position as number);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
