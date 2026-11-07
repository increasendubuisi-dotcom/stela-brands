import { describe, expect, it } from "vitest";
import { byPosition, needsRebalance, POSITION_STEP, positionBetween, rebalance } from "./position";

describe("positionBetween", () => {
  it("places first, last and between", () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
    expect(positionBetween(null, 1024)).toBe(0);
    expect(positionBetween(1024, null)).toBe(2048);
    expect(positionBetween(1024, 2048)).toBe(1536);
  });

  it("rejects inverted neighbours", () => {
    expect(() => positionBetween(2048, 1024)).toThrow();
  });

  it("supports many inserts at the same spot before needing a rebalance", () => {
    let before = 1024;
    const after = 2048;
    let inserts = 0;
    while (!needsRebalance(before, after)) {
      before = positionBetween(before, after);
      inserts++;
    }
    expect(inserts).toBeGreaterThan(25);
  });
});

describe("rebalance", () => {
  it("keeps order and spreads positions evenly", () => {
    const items = [
      { id: "c", position: 3.0000001 },
      { id: "a", position: 3 },
      { id: "b", position: 3.00000005 },
    ];
    const next = rebalance(items);
    expect([...next.entries()]).toEqual([
      ["a", 1024],
      ["b", 2048],
      ["c", 3072],
    ]);
  });

  it("sorts ties by id so order is stable", () => {
    const sorted = [
      { id: "b", position: 1 },
      { id: "a", position: 1 },
    ].sort(byPosition);
    expect(sorted.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
